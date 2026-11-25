import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, type EntityManager } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';
import { DISPUTE_POLICY } from '@/modules/dispute/constants/dispute.constant';
import { DisputeAccess } from '@/modules/dispute/dispute.access';
import { DisputeEvidence } from '@/modules/dispute/entities/dispute.entity';
import {
  disputeFileSchema,
  disputeUploadSchema,
} from '@/modules/dispute/schemas/dispute.schema';
import { Order } from '@/modules/order/entities/order.entity';

import { ChatService } from './chat.service';
import { ChatMessageMedia } from './entities/chat-message-media.entity';

@Injectable()
export class ChatMediaService {
  constructor(
    private readonly db: DataSource,
    private readonly chat: ChatService,
    private readonly storage: StorageService,
    private readonly dispute: DisputeAccess,
  ) {}

  async download(userId: string, id: string) {
    const link = await this.loadPrivateMediaLink(
      this.db.manager,
      id,
      'Attached chat media not found',
    );
    await this.chat.loadConversation(
      this.db.manager,
      userId,
      link.message.conversationId,
    );
    return this.storage.createDownloadUrl(link.media.storageKey);
  }

  async importEvidence(
    userId: string,
    mediaId: string,
    orderId: string,
    tags: string[],
  ) {
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const link = await this.loadPrivateMediaLink(
        manager,
        mediaId,
        'Chat media not found',
      );

      const { row: conversation } = await this.chat.loadConversation(
        manager,
        userId,
        link.message.conversationId,
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
      if (!order) {
        throw new BadRequestException(
          'Chat evidence order must belong to this buyer and Shop',
        );
      }
      await this.dispute.assertParty(manager, userId, orderId);

      const media = link.media;
      const input = disputeUploadSchema.parse({ mediaId, tags });
      if (
        !disputeFileSchema.safeParse({
          mimeType: media.mimeType,
          sizeBytes: media.sizeBytes,
        }).success
      ) {
        throw new BadRequestException('Invalid evidence file');
      }

      const existing = await manager.findOneBy(DisputeEvidence, {
        mediaId,
        orderId,
        uploadedById: userId,
      });
      if (existing) {
        const tagsChanged =
          JSON.stringify([...existing.tags].sort()) !==
          JSON.stringify([...input.tags].sort());
        if (tagsChanged) {
          throw new BadRequestException('Chat evidence import tags changed');
        }
        return this.evidenceView(existing);
      }

      await this.dispute.assertUploadAllowed(manager, userId, orderId, now);
      if (
        (await manager.countBy(DisputeEvidence, {
          orderId,
          uploadedById: userId,
        })) >= DISPUTE_POLICY.MAX_EVIDENCE_PER_ORDER_USER
      ) {
        throw new BadRequestException('Evidence limit reached');
      }

      const evidence = await manager.save(
        DisputeEvidence,
        manager.create(DisputeEvidence, {
          orderId,
          uploadedById: userId,
          mediaId,
          media,
          tags: input.tags,
        }),
      );
      return this.evidenceView(evidence);
    });
  }

  private async loadPrivateMediaLink(
    manager: EntityManager,
    mediaId: string,
    notFoundMessage: string,
  ) {
    const link = await manager
      .createQueryBuilder(ChatMessageMedia, 'link')
      .innerJoinAndSelect('link.media', 'media')
      .innerJoinAndSelect('link.message', 'message')
      .where('link.mediaId = :mediaId', { mediaId })
      .getOne();
    if (!link || link.media.visibility !== 'private' || link.media.retiredAt) {
      throw new NotFoundException(notFoundMessage);
    }
    return link;
  }

  private evidenceView(evidence: DisputeEvidence) {
    return {
      id: evidence.id,
      mimeType: evidence.mimeType,
      sizeBytes: evidence.sizeBytes,
      tags: evidence.tags,
    };
  }
}
