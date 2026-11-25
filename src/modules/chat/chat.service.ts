import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { Brackets, DataSource, type EntityManager, In } from 'typeorm';

import { MediaService } from '@/modules/media/media.service';
import { Order } from '@/modules/order/entities/order.entity';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { isProductDisplayable } from '@/modules/product/machines/product-availability.machine';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';

import { notifyChatMessage } from './chat-message.notification';
import { ChatAccess } from './chat.access';
import { CHAT_CARD, CHAT_SIDE } from './constants/chat.constant';
import { ChatMessageMedia } from './entities/chat-message-media.entity';
import { ChatConversation, ChatMessage } from './entities/chat.entity';
import {
  type ChatCardSnapshot,
  type ChatPageInput,
  type ChatSide,
  chatUploadSchema,
  type SendChatInput,
  sendChatSchema,
} from './schemas/chat.schema';

@Injectable()
export class ChatService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ChatAccess,
    private readonly media: MediaService,
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
        if (await manager.existsBy(ShopMember, { userId: buyerId, shopId })) {
          throw new BadRequestException(
            'Shop members cannot open a buyer conversation with their own Shop',
          );
        }
        row = await manager.save(
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
      }
      return this.conversationView(manager, row, CHAT_SIDE.BUYER);
    });
  }

  async detail(userId: string, id: string) {
    const { row, side } = await this.access.load(this.db.manager, userId, id);
    return this.conversationView(this.db.manager, row, side);
  }

  async list(userId: string, input: { limit: number; offset: number }) {
    const manager = this.db.manager;
    await this.access.active(manager, userId);
    const member = await manager.findOneBy(ShopMember, { userId });
    const shopId =
      member && (await this.access.canManage(manager, userId, member.shopId))
        ? member.shopId
        : null;

    const [rows, total] = await manager
      .createQueryBuilder(ChatConversation, 'conversation')
      .leftJoinAndSelect('conversation.buyer', 'buyer')
      .leftJoinAndSelect('conversation.shop', 'shop')
      .where(
        new Brackets((q) => {
          q.where('conversation.buyerId = :userId', { userId });
          if (shopId) q.orWhere('conversation.shopId = :shopId', { shopId });
        }),
      )
      .orderBy('conversation.lastMessageAt', 'DESC', 'NULLS LAST')
      .addOrderBy('conversation.id', 'DESC')
      .take(input.limit)
      .skip(input.offset)
      .getManyAndCount();

    if (!rows.length) return { items: [], total, ...input };

    const unreadRows: Array<{ conversationId: string; cnt: string }> =
      await manager.query(
        `
        SELECT m."conversationId", COUNT(*)::int AS cnt
        FROM chat_messages m
        JOIN chat_conversations c ON c.id = m."conversationId"
        WHERE m."conversationId" = ANY($1::uuid[])
          AND m."senderId" != $2
          AND m.sequence > CASE WHEN c."buyerId" = $2 THEN c."buyerReadSequence" ELSE c."shopReadSequence" END
        GROUP BY m."conversationId"
        `,
        [rows.map((r) => r.id), userId],
      );
    const unreadMap = new Map(
      unreadRows.map((r) => [r.conversationId, Number(r.cnt)]),
    );

    const items = rows.map((row) => {
      const side = row.buyerId === userId ? CHAT_SIDE.BUYER : CHAT_SIDE.SHOP;
      return this.formatConversationView(
        row,
        row.buyer.fullName,
        row.shop.name,
        side,
        unreadMap.get(row.id) ?? 0,
      );
    });
    return { items, total, ...input };
  }

  async messages(userId: string, id: string, input: ChatPageInput) {
    const manager = this.db.manager;
    await this.access.load(manager, userId, id);
    const query = manager
      .createQueryBuilder(ChatMessage, 'message')
      .where('message.conversationId = :id', { id });
    if (input.after !== undefined) {
      query.andWhere('message.sequence > :after', { after: input.after });
    }
    if (input.before !== undefined) {
      query.andWhere('message.sequence < :before', { before: input.before });
    }
    const ascending = input.after !== undefined;
    let rows = await query
      .orderBy('message.sequence', ascending ? 'ASC' : 'DESC')
      .take(input.limit + 1)
      .getMany();
    const hasMore = rows.length > input.limit;
    rows = rows.slice(0, input.limit);
    if (!ascending) rows.reverse();
    return {
      items: await this.messageViews(manager, rows),
      hasMore,
      nextAfter: rows.at(-1)?.sequence ?? null,
      nextBefore: rows[0]?.sequence ?? null,
    };
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
        if (prior.fingerprint !== fingerprint) {
          throw new ConflictException('Message request payload changed');
        }
        return (await this.messageViews(manager, [prior]))[0];
      }

      for (const mediaId of [...parsed.mediaIds].sort()) {
        const media = await this.media.verifyMedia(
          manager,
          userId,
          mediaId,
          undefined,
          'private',
        );
        if (
          !chatUploadSchema.safeParse({
            mimeType: media.mimeType,
            sizeBytes: media.sizeBytes,
          }).success
        ) {
          throw new BadRequestException('Invalid chat attachment');
        }
      }

      const card = await this.resolveCardSnapshot(manager, row, parsed.card);
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
          card,
        }),
      );

      if (parsed.mediaIds.length) {
        await manager.save(
          ChatMessageMedia,
          parsed.mediaIds.map((mediaId, sortOrder) =>
            manager.create(ChatMessageMedia, {
              mediaId,
              messageId: message.id,
              sortOrder,
            }),
          ),
        );
      }

      row.lastSequence = message.sequence;
      row.lastMessageAt = message.createdAt;
      await manager.save(row);
      await notifyChatMessage(manager, row, message);
      return (await this.messageViews(manager, [message]))[0];
    });
  }

  read(userId: string, id: string, throughSequence: number) {
    return this.db.transaction(async (manager) => {
      const { row, side } = await this.access.load(manager, userId, id, true);
      if (
        !Number.isSafeInteger(throughSequence) ||
        throughSequence < 0 ||
        throughSequence > row.lastSequence
      ) {
        throw new BadRequestException('Read cursor exceeds conversation');
      }
      if (side === CHAT_SIDE.BUYER) {
        row.buyerReadSequence = Math.max(
          row.buyerReadSequence,
          throughSequence,
        );
      } else {
        row.shopReadSequence = Math.max(row.shopReadSequence, throughSequence);
      }
      await manager.save(row);
      return this.conversationView(manager, row, side);
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
    return this.formatConversationView(
      row,
      buyer.fullName,
      shop.name,
      side,
      unreadCount,
    );
  }

  private formatConversationView(
    row: ChatConversation,
    buyerName: string,
    shopName: string,
    side: ChatSide,
    unreadCount: number,
  ) {
    const readSequence =
      side === CHAT_SIDE.BUYER ? row.buyerReadSequence : row.shopReadSequence;
    return {
      id: row.id,
      buyerId: row.buyerId,
      buyerName,
      shopId: row.shopId,
      shopName,
      side,
      lastSequence: row.lastSequence,
      readSequence,
      peerReadSequence:
        side === CHAT_SIDE.BUYER ? row.shopReadSequence : row.buyerReadSequence,
      unreadCount,
      lastMessageAt: row.lastMessageAt,
    };
  }

  private async messageViews(manager: EntityManager, rows: ChatMessage[]) {
    const links = rows.length
      ? await manager.find(ChatMessageMedia, {
          where: { messageId: In(rows.map((row) => row.id)) },
          relations: { media: true },
          order: { sortOrder: 'ASC' },
        })
      : [];
    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      sequence: row.sequence,
      senderSide: row.senderSide,
      clientMessageId: row.clientMessageId,
      text: row.text,
      card: row.card,
      createdAt: row.createdAt,
      media: links
        .filter((link) => link.messageId === row.id)
        .map(({ media }) => ({
          id: media.id,
          mimeType: media.mimeType,
          sizeBytes: media.sizeBytes,
        })),
    }));
  }

  private async resolveCardSnapshot(
    manager: EntityManager,
    conversation: ChatConversation,
    card: SendChatInput['card'],
  ): Promise<ChatCardSnapshot | null> {
    if (!card) return null;
    if (card.type === CHAT_CARD.ORDER) {
      const order = await manager.findOneBy(Order, {
        id: card.id,
        buyerId: conversation.buyerId,
        shopId: conversation.shopId,
      });
      if (!order) {
        throw new BadRequestException(
          'Order card must belong to this buyer and Shop',
        );
      }
      return { type: CHAT_CARD.ORDER, id: order.id, status: order.status };
    }

    const product = await manager.findOne(Product, {
      where: {
        id: card.id,
        shopId: conversation.shopId,
        status: ProductStatus.ACTIVE,
      },
      relations: { category: true, shop: true },
    });
    if (
      !product ||
      !isProductDisplayable(product, { requireCompleteMetadata: true })
    ) {
      throw new BadRequestException(
        'Product card must be a public approved listing of this Shop',
      );
    }
    return {
      type: CHAT_CARD.PRODUCT,
      id: product.id,
      title: product.title ?? '',
      price: product.price,
      status: product.status,
    };
  }
}
