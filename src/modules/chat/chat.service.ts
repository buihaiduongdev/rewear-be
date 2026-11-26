import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Brackets, DataSource, type EntityManager, In } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxService } from '@/modules/event/outbox.service';
import { MediaService } from '@/modules/media/media.service';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';

import { CHAT_SIDE } from './constants/chat.constant';
import { ChatConversation, ChatMessage } from './entities';
import { ChatMessageMedia } from './entities/chat-message-media.entity';
import {
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
    private readonly authorization: AuthorizationService,
    private readonly media: MediaService,
    private readonly outboxService: OutboxService,
    private readonly storage: StorageService,
  ) {}

  async open(buyerId: string, shopId: string) {
    const manager = this.db.manager;
    let row = await manager.findOneBy(ChatConversation, { buyerId, shopId });
    if (!row) {
      const shopCheck = await manager
        .createQueryBuilder(Shop, 'shop')
        .leftJoin(
          ShopMember,
          'member',
          'member.shopId = shop.id AND member.userId = :buyerId',
          { buyerId },
        )
        .select('shop.status', 'status')
        .addSelect('member.id', 'memberId')
        .where('shop.id = :shopId', { shopId })
        .getRawOne<{ status: ShopStatus; memberId: string | null }>();
      if (shopCheck?.status !== ShopStatus.ACTIVE) {
        throw new ForbiddenException('Shop is not accepting new chat messages');
      }
      if (shopCheck.memberId) {
        throw new BadRequestException(
          'Shop members cannot open a buyer conversation with their own Shop',
        );
      }
      await manager
        .createQueryBuilder()
        .insert()
        .into(ChatConversation)
        .values({ buyerId, shopId })
        .orIgnore()
        .execute();
      row = await manager.findOneByOrFail(ChatConversation, {
        buyerId,
        shopId,
      });
    }
    return row;
  }

  async detail(userId: string, id: string) {
    const { row, side } = await this.loadConversation(
      this.db.manager,
      userId,
      id,
    );
    return this.conversationView(this.db.manager, row, userId, side);
  }

  async list(userId: string, input: ChatPageInput) {
    const manager = this.db.manager;
    const member = await manager.findOneBy(ShopMember, { userId });
    const shopId =
      member &&
      (await this.authorization.hasPermission(
        userId,
        member.shopId,
        SHOP_PERMISSIONS.CHAT_MANAGE,
        manager,
      ))
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

    const unreadMap = await this.unreadCounts(
      manager,
      rows.map((r) => r.id),
      userId,
    );

    const items = await Promise.all(
      rows.map((row) =>
        this.conversationView(
          manager,
          row,
          userId,
          row.buyerId === userId ? CHAT_SIDE.BUYER : CHAT_SIDE.SHOP,
          unreadMap.get(row.id) ?? 0,
        ),
      ),
    );
    return { items, total, ...input };
  }

  async messages(userId: string, id: string, input: ChatPageInput) {
    const manager = this.db.manager;
    await this.loadConversation(manager, userId, id);
    const [rows, total] = await manager
      .createQueryBuilder(ChatMessage, 'message')
      .where('message.conversationId = :id', { id })
      .orderBy('message.createdAt', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .take(input.limit)
      .skip(input.offset)
      .getManyAndCount();
    rows.reverse();
    return {
      items: await this.messageViews(manager, rows),
      total,
      ...input,
    };
  }

  send(userId: string, id: string, input: SendChatInput) {
    const parsed = sendChatSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const { row } = await this.loadConversation(manager, userId, id);

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

      const message = await manager.save(
        ChatMessage,
        manager.create(ChatMessage, {
          conversationId: id,
          senderId: userId,
          text: parsed.text ?? null,
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

      await manager.update(ChatConversation, row.id, {
        lastMessageAt: message.createdAt,
      });
      await this.outboxService.record(manager, {
        eventType: EVENT_TYPES.CHAT_MESSAGE_CREATED,
        resourceId: row.id,
        payload: {
          messageId: message.id,
          conversationId: row.id,
          buyerId: row.buyerId,
          shopId: row.shopId,
          senderId: message.senderId,
        },
      });
      return (await this.messageViews(manager, [message]))[0];
    });
  }

  read(userId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const { row, side } = await this.loadConversation(manager, userId, id);
      const now = new Date();
      if (side === CHAT_SIDE.BUYER) {
        row.buyerLastReadAt = now;
      } else {
        row.shopLastReadAt = now;
      }
      await manager.save(row);
      return this.conversationView(manager, row, userId, side);
    });
  }

  async download(userId: string, id: string) {
    const links = await this.db.manager
      .createQueryBuilder(ChatMessageMedia, 'link')
      .innerJoinAndSelect('link.media', 'media')
      .innerJoinAndSelect('link.message', 'message')
      .innerJoinAndSelect('message.conversation', 'conversation')
      .where('link.mediaId = :mediaId', { mediaId: id })
      .andWhere('media.visibility = :visibility', { visibility: 'private' })
      .andWhere('media.retiredAt IS NULL')
      .getMany();
    if (!links.length) {
      throw new NotFoundException('Attached chat media not found');
    }
    const member = await this.db.manager.findOneBy(ShopMember, { userId });
    const link =
      links.find(
        (row) =>
          row.message.conversation.buyerId === userId ||
          (member && row.message.conversation.shopId === member.shopId),
      ) ?? links[0];
    await this.loadConversation(
      this.db.manager,
      userId,
      link.message.conversationId,
    );
    return this.storage.createDownloadUrl(link.media.storageKey);
  }

  private async loadConversation(
    manager: EntityManager,
    userId: string,
    id: string,
  ) {
    const row = await manager.findOneBy(ChatConversation, { id });
    if (!row) throw new NotFoundException('Conversation not found');
    if (row.buyerId === userId) return { row, side: CHAT_SIDE.BUYER };
    if (
      await this.authorization.hasPermission(
        userId,
        row.shopId,
        SHOP_PERMISSIONS.CHAT_MANAGE,
        manager,
      )
    ) {
      return { row, side: CHAT_SIDE.SHOP };
    }
    throw new ForbiddenException('Chat access denied');
  }

  private async unreadCounts(
    manager: EntityManager,
    conversationIds: string[],
    userId: string,
  ) {
    if (!conversationIds.length) return new Map<string, number>();
    const rows: Array<{ conversationId: string; cnt: string }> =
      await manager.query(
        `
        SELECT m."conversationId", COUNT(*)::int AS cnt
        FROM chat_messages m
        JOIN chat_conversations c ON c.id = m."conversationId"
        WHERE m."conversationId" = ANY($1::uuid[])
          AND (
            (c."buyerId" = $2 AND m."senderId" != c."buyerId" AND (c."buyerLastReadAt" IS NULL OR m."createdAt" > c."buyerLastReadAt"))
            OR
            (c."buyerId" != $2 AND m."senderId" = c."buyerId" AND (c."shopLastReadAt" IS NULL OR m."createdAt" > c."shopLastReadAt"))
          )
        GROUP BY m."conversationId"
        `,
        [conversationIds, userId],
      );
    return new Map(rows.map((r) => [r.conversationId, Number(r.cnt)]));
  }

  private async conversationView(
    manager: EntityManager,
    row: ChatConversation,
    userId: string,
    side: ChatSide,
    unreadCount?: number,
  ) {
    const buyer =
      row.buyer ?? (await manager.findOneByOrFail(User, { id: row.buyerId }));
    const shop =
      row.shop ?? (await manager.findOneByOrFail(Shop, { id: row.shopId }));
    const count =
      unreadCount ??
      (await this.unreadCounts(manager, [row.id], userId)).get(row.id) ??
      0;
    return {
      id: row.id,
      buyerId: row.buyerId,
      buyerName: buyer.fullName,
      shopId: row.shopId,
      shopName: shop.name,
      side,
      unreadCount: count,
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
      senderId: row.senderId,
      text: row.text,
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
}
