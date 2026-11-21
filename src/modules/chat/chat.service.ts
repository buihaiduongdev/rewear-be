import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { Brackets, DataSource, type EntityManager, In } from 'typeorm';

import { Shop, ShopMember } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';

import { notifyChatMessage } from './chat-message.notification';
import { chatMessageViews } from './chat-message.view';
import { ChatAccess } from './chat.access';
import { CHAT_POLICY, CHAT_SIDE } from './constants/chat.constant';
import {
  ChatConversation,
  ChatMedia,
  ChatMessage,
} from './entities/chat.entity';
import { chatCardSnapshot } from './policies/chat-card.policy';
import { sendChatSchema } from './schemas/chat.schema';
import type { ChatPageInput, ChatSide, SendChatInput } from './types/chat.type';

@Injectable()
export class ChatService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ChatAccess,
  ) {}
  open(buyerId: string, shopId: string) {
    return this.db.transaction(async (manager) => {
      await this.access.active(manager, buyerId);
      await manager.query(
        'SELECT pg_advisory_xact_lock(782146, hashtext($1))',
        [buyerId + ':' + shopId],
      );
      let row = await manager.findOneBy(ChatConversation, { buyerId, shopId });
      if (!row) {
        await this.access.activeShop(manager, shopId);
        if (await manager.existsBy(ShopMember, { userId: buyerId, shopId }))
          throw new BadRequestException(
            'Shop members cannot open a buyer conversation with their own Shop',
          );
      }
      row ??= await manager.save(
        ChatConversation,
        manager.create(ChatConversation, {
          buyerId,
          shopId,
          lastSequence: 0,
          buyerReadSequence: 0,
          shopReadSequence: 0,
          lastMessageAt: null,
        }),
      );
      return this.conversationView(manager, row, CHAT_SIDE.BUYER);
    });
  }
  private async conversationView(
    manager: EntityManager,
    row: ChatConversation,
    side: ChatSide,
  ) {
    const buyer = await manager.findOneByOrFail(User, { id: row.buyerId });
    const shop = await manager.findOneByOrFail(Shop, { id: row.shopId });
    const readSequence =
      side === CHAT_SIDE.BUYER ? row.buyerReadSequence : row.shopReadSequence;
    const unreadCount = await manager
      .createQueryBuilder(ChatMessage, 'message')
      .where(
        'message.conversationId = :id AND message.sequence > :readSequence AND message.senderSide != :side',
        { id: row.id, readSequence, side },
      )
      .getCount();
    return {
      id: row.id,
      buyerId: row.buyerId,
      buyerName: buyer.fullName,
      shopId: row.shopId,
      shopName: shop.name,
      side,
      lastSequence: row.lastSequence,
      readSequence,
      peerReadSequence:
        side === CHAT_SIDE.BUYER ? row.shopReadSequence : row.buyerReadSequence,
      unreadCount,
      lastMessageAt: row.lastMessageAt,
    };
  }
  detail(userId: string, id: string) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const { row, side } = await this.access.load(manager, userId, id);
      return this.conversationView(manager, row, side);
    });
  }
  list(userId: string, input: { limit: number; offset: number }) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      await this.access.active(manager, userId);
      const member = await manager.findOneBy(ShopMember, { userId });
      const shopId =
        member && (await this.access.canManage(manager, userId, member.shopId))
          ? member.shopId
          : null;
      const query = manager
        .createQueryBuilder(ChatConversation, 'conversation')
        .where(
          new Brackets((q) => {
            q.where('conversation.buyerId = :userId', { userId });
            if (shopId) q.orWhere('conversation.shopId = :shopId', { shopId });
          }),
        );
      const [rows, total] = await query
        .orderBy('conversation.lastMessageAt', 'DESC', 'NULLS LAST')
        .addOrderBy('conversation.id', 'DESC')
        .take(input.limit)
        .skip(input.offset)
        .getManyAndCount();
      const items = [];
      for (const row of rows)
        items.push(
          await this.conversationView(
            manager,
            row,
            row.buyerId === userId ? CHAT_SIDE.BUYER : CHAT_SIDE.SHOP,
          ),
        );
      return { items, total, ...input };
    });
  }
  messages(userId: string, id: string, input: ChatPageInput) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      await this.access.load(manager, userId, id);
      const query = manager
        .createQueryBuilder(ChatMessage, 'message')
        .where('message.conversationId = :id', { id });
      if (input.after !== undefined)
        query.andWhere('message.sequence > :after', { after: input.after });
      if (input.before !== undefined)
        query.andWhere('message.sequence < :before', { before: input.before });
      const ascending = input.after !== undefined;
      let rows = await query
        .orderBy('message.sequence', ascending ? 'ASC' : 'DESC')
        .take(input.limit + 1)
        .getMany();
      const hasMore = rows.length > input.limit;
      rows = rows.slice(0, input.limit);
      if (!ascending) rows.reverse();
      return {
        items: await chatMessageViews(manager, rows),
        hasMore,
        nextAfter: rows.at(-1)?.sequence ?? null,
        nextBefore: rows[0]?.sequence ?? null,
      };
    });
  }
  send(userId: string, id: string, input: SendChatInput) {
    const parsed = sendChatSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const { row, side } = await this.access.load(manager, userId, id, true);
      const fingerprint = createHash('sha256')
        .update(JSON.stringify(parsed))
        .digest('hex');
      const prior = await manager.findOneBy(ChatMessage, {
        conversationId: id,
        senderId: userId,
        clientMessageId: parsed.clientMessageId,
      });
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw new ConflictException('Message request payload changed');
        return (await chatMessageViews(manager, [prior]))[0];
      }
      if (row.lastSequence >= CHAT_POLICY.MAX_SEQUENCE)
        throw new ConflictException('Conversation sequence exhausted');
      const attachments = parsed.mediaIds.length
        ? await manager.findBy(ChatMedia, { id: In(parsed.mediaIds) })
        : [];
      const invalidMedia =
        attachments.length !== parsed.mediaIds.length ||
        attachments.some(
          (media) =>
            media.conversationId !== id ||
            media.uploadedById !== userId ||
            !media.ready ||
            !media.eTag ||
            media.messageId !== null,
        );
      if (invalidMedia)
        throw new BadRequestException(
          'Message media must be owned ready uploads of this conversation',
        );
      const card = await chatCardSnapshot(manager, row, parsed.card);
      const message = await manager.save(
        ChatMessage,
        manager.create(ChatMessage, {
          conversationId: id,
          sequence: row.lastSequence + 1,
          senderId: userId,
          senderSide: side,
          clientMessageId: parsed.clientMessageId,
          fingerprint,
          text: parsed.text ?? null,
          mediaIds: parsed.mediaIds,
          card,
        }),
      );
      for (const media of attachments) {
        media.messageId = message.id;
        await manager.save(media);
      }
      row.lastSequence = message.sequence;
      row.lastMessageAt = message.createdAt;
      await manager.save(row);
      await notifyChatMessage(manager, row, message);
      return (await chatMessageViews(manager, [message]))[0];
    });
  }
  read(userId: string, id: string, throughSequence: number) {
    return this.db.transaction(async (manager) => {
      const { row, side } = await this.access.load(manager, userId, id, true);
      if (
        !Number.isSafeInteger(throughSequence) ||
        throughSequence < 0 ||
        throughSequence > row.lastSequence
      )
        throw new BadRequestException('Read cursor exceeds conversation');
      if (side === CHAT_SIDE.BUYER)
        row.buyerReadSequence = Math.max(
          row.buyerReadSequence,
          throughSequence,
        );
      else
        row.shopReadSequence = Math.max(row.shopReadSequence, throughSequence);
      await manager.save(row);
      return this.conversationView(manager, row, side);
    });
  }
}
