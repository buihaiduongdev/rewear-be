import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, type EntityManager } from 'typeorm';

import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';
import type { StoredObjectMetadata } from '@/infrastructure/storage/storage.interface';
import {
  DISPUTE_EVIDENCE_STATE,
  DISPUTE_POLICY,
} from '@/modules/dispute/constants/dispute.constant';
import { DisputeAccess } from '@/modules/dispute/dispute.access';
import { DisputeEvidence } from '@/modules/dispute/entities/dispute.entity';
import { disputeUploadSchema } from '@/modules/dispute/schemas/dispute.schema';
import { Order } from '@/modules/order/entities/order.entity';

import { ChatAccess } from '../chat.access';
import { ChatEvidenceLink } from '../entities/chat-evidence.entity';
import { ChatMedia, ChatMessage } from '../entities/chat.entity';

@Injectable()
export class ChatEvidenceService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ChatAccess,
    private readonly dispute: DisputeAccess,
    private readonly storage: PrivateEvidenceStorage,
  ) {}
  private async immutableSource(
    manager: EntityManager,
    mediaId: string,
    conversationId: string,
    metadata: StoredObjectMetadata,
  ) {
    const media = await manager.findOneByOrFail(ChatMedia, { id: mediaId });
    const message = media.messageId
      ? await manager.findOneBy(ChatMessage, {
          id: media.messageId,
          conversationId,
        })
      : null;
    const validSource =
      media.ready &&
      media.eTag &&
      message?.mediaIds.includes(mediaId) &&
      metadata.eTag === media.eTag &&
      metadata.contentType === media.mimeType &&
      metadata.sizeBytes === media.sizeBytes;
    if (!validSource)
      throw new BadRequestException(
        'Chat evidence requires an attached immutable object',
      );
    return media;
  }
  private view(evidence: DisputeEvidence) {
    return {
      id: evidence.id,
      mimeType: evidence.mimeType,
      sizeBytes: evidence.sizeBytes,
      tags: evidence.tags,
      status: evidence.status,
      readyAt: evidence.readyAt,
    };
  }
  async import(
    userId: string,
    mediaId: string,
    orderId: string,
    tags: string[],
  ) {
    const original = await this.db.manager.findOneBy(ChatMedia, {
      id: mediaId,
    });
    if (!original) throw new NotFoundException('Chat media not found');
    await this.access.load(this.db.manager, userId, original.conversationId);
    const metadata = await this.storage.getObjectMetadata(original.storageKey);
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const { row: conversation } = await this.access.load(
        manager,
        userId,
        original.conversationId,
      );
      const [{ now: timestamp }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(timestamp);
      const order = await manager.findOneBy(Order, {
        id: orderId,
        buyerId: conversation.buyerId,
        shopId: conversation.shopId,
      });
      if (!order)
        throw new BadRequestException(
          'Chat evidence order must belong to this buyer and Shop',
        );
      await this.dispute.assertParty(manager, userId, orderId);
      const media = await this.immutableSource(
        manager,
        mediaId,
        conversation.id,
        metadata,
      );
      const input = disputeUploadSchema.parse({
        mimeType: media.mimeType,
        sizeBytes: media.sizeBytes,
        tags,
      });
      const existing = await manager.findOneBy(ChatEvidenceLink, {
        mediaId,
        orderId,
        importedById: userId,
      });
      if (existing) {
        const evidence = await manager.findOneByOrFail(DisputeEvidence, {
          id: existing.evidenceId,
        });
        const tagsChanged =
          JSON.stringify([...evidence.tags].sort()) !==
          JSON.stringify([...input.tags].sort());
        if (tagsChanged)
          throw new BadRequestException('Chat evidence import tags changed');
        return this.view(evidence);
      }
      await this.dispute.assertUploadAllowed(manager, userId, orderId, now);
      if (
        (await manager.countBy(DisputeEvidence, {
          orderId,
          uploadedById: userId,
        })) >= DISPUTE_POLICY.MAX_EVIDENCE_PER_ORDER_USER
      )
        throw new BadRequestException('Evidence limit reached');
      const evidence = await manager.save(
        DisputeEvidence,
        manager.create(DisputeEvidence, {
          orderId,
          uploadedById: userId,
          storageKey: media.storageKey,
          mimeType: media.mimeType,
          sizeBytes: media.sizeBytes,
          tags: input.tags,
          status: DISPUTE_EVIDENCE_STATE.READY,
          uploadExpiresAt: media.uploadExpiresAt,
          eTag: media.eTag,
          readyAt: now,
        }),
      );
      await manager.save(
        ChatEvidenceLink,
        manager.create(ChatEvidenceLink, {
          mediaId,
          orderId,
          importedById: userId,
          evidenceId: evidence.id,
        }),
      );
      return this.view(evidence);
    });
  }
}
