import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource } from 'typeorm';

import { DISPUTE_POLICY } from '@/modules/dispute/constants/dispute.constant';
import { DisputeAccess } from '@/modules/dispute/dispute.access';
import { DisputeEvidence } from '@/modules/dispute/entities/dispute.entity';
import {
  disputeFileSchema,
  disputeUploadSchema,
} from '@/modules/dispute/schemas/dispute.schema';
import { Order } from '@/modules/order/entities/order.entity';

import { ChatAccess } from '../chat.access';
import { ChatMessageMedia } from '../entities/chat-message-media.entity';
import { ChatMessage } from '../entities/chat.entity';

@Injectable()
export class ChatEvidenceService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ChatAccess,
    private readonly dispute: DisputeAccess,
  ) {}
  private view(evidence: DisputeEvidence) {
    return {
      id: evidence.id,
      mimeType: evidence.mimeType,
      sizeBytes: evidence.sizeBytes,
      tags: evidence.tags,
    };
  }
  async import(
    userId: string,
    mediaId: string,
    orderId: string,
    tags: string[],
  ) {
    const link = await this.db.manager.findOne(ChatMessageMedia, {
      where: { mediaId },
      relations: { media: true },
    });
    if (!link || link.media.visibility !== 'private' || link.media.retiredAt)
      throw new NotFoundException('Chat media not found');
    const message = await this.db.manager.findOneByOrFail(ChatMessage, {
      id: link.messageId,
    });
    await this.access.load(this.db.manager, userId, message.conversationId);
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const { row: conversation } = await this.access.load(
        manager,
        userId,
        message.conversationId,
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
      const media = link.media;
      const input = disputeUploadSchema.parse({ mediaId, tags });
      if (
        !disputeFileSchema.safeParse({
          mimeType: media.mimeType,
          sizeBytes: media.sizeBytes,
        }).success
      )
        throw new BadRequestException('Invalid evidence file');
      const existing = await manager.findOneBy(DisputeEvidence, {
        mediaId,
        orderId,
        uploadedById: userId,
      });
      if (existing) {
        const tagsChanged =
          JSON.stringify([...existing.tags].sort()) !==
          JSON.stringify([...input.tags].sort());
        if (tagsChanged)
          throw new BadRequestException('Chat evidence import tags changed');
        return this.view(existing);
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
          mediaId,
          media,
          tags: input.tags,
        }),
      );
      return this.view(evidence);
    });
  }
}
