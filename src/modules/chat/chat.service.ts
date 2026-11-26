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
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
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

  open(buyerId: string, shopId: string) {
    return this.db.transaction(async (manager) => {
      let row = await manager.findOneBy(ChatConversation, { buyerId, shopId });
      if (!row) {
        await this.assertActiveShop(manager, shopId);
        if (await manager.existsBy(ShopMember, { userId: buyerId, shopId })) {
          throw new BadRequestException(
            'Shop members cannot open a buyer conversation with their own Shop',
          );
        }
        await manager
          .createQueryBuilder()
          .insert()
          .into(ChatConversation)
          .values({
            buyerId,
            shopId,
            buyerLastReadAt: null,
            shopLastReadAt: null,
            lastMessageAt: null,
          })
          .orIgnore()
          .execute();
        row = await manager.findOneByOrFail(ChatConversation, {
          buyerId,
          shopId,
        });
      }
      return this.conversationView(manager, row, buyerId, CHAT_SIDE.BUYER);
    });
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
    await this.loadConversation(manager, userId, id);
    const [rows, total] = await manager
      .createQueryBuilder(ChatMessage, 'message')
      .leftJoinAndSelect('message.product', 'product')
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

      const product = parsed.productId
        ? await this.resolveProduct(manager, row, parsed.productId)
        : null;

      const message = await manager.save(
        ChatMessage,
        manager.create(ChatMessage, {
          conversationId: id,
          senderId: userId,
          text: parsed.text ?? null,
          productId: product?.id ?? null,
          product,
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
    const links = await this.loadPrivateMediaLinks(
      this.db.manager,
      id,
      'Attached chat media not found',
    );
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

  private async loadPrivateMediaLinks(
    manager: EntityManager,
    mediaId: string,
    notFoundMessage: string,
  ) {
    const links = await manager
      .createQueryBuilder(ChatMessageMedia, 'link')
      .innerJoinAndSelect('link.media', 'media')
      .innerJoinAndSelect('link.message', 'message')
      .innerJoinAndSelect('message.conversation', 'conversation')
      .where('link.mediaId = :mediaId', { mediaId })
      .andWhere('media.visibility = :visibility', { visibility: 'private' })
      .andWhere('media.retiredAt IS NULL')
      .getMany();
    if (!links.length) {
      throw new NotFoundException(notFoundMessage);
    }
    return links;
  }

  private async loadConversation(
    manager: EntityManager,
    userId: string,
    id: string,
  ) {
    const row = await manager.findOneBy(ChatConversation, { id });
    if (!row) throw new NotFoundException('Conversation not found');
    const side = await this.resolveSide(manager, userId, row);
    return { row, side };
  }

  private async resolveSide(
    manager: EntityManager,
    userId: string,
    row: ChatConversation,
  ) {
    if (row.buyerId === userId) return CHAT_SIDE.BUYER;
    if (
      await this.authorization.hasPermission(
        userId,
        row.shopId,
        SHOP_PERMISSIONS.CHAT_MANAGE,
        manager,
      )
    )
      return CHAT_SIDE.SHOP;
    throw new ForbiddenException('Chat access denied');
  }

  private async assertActiveShop(manager: EntityManager, shopId: string) {
    if (
      !(await manager.existsBy(Shop, { id: shopId, status: ShopStatus.ACTIVE }))
    )
      throw new ForbiddenException('Shop is not accepting new chat messages');
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
  ) {
    const buyer =
      row.buyer ?? (await manager.findOneByOrFail(User, { id: row.buyerId }));
    const shop =
      row.shop ?? (await manager.findOneByOrFail(Shop, { id: row.shopId }));
    const unreadMap = await this.unreadCounts(manager, [row.id], userId);
    return this.formatConversationView(
      row,
      buyer.fullName,
      shop.name,
      side,
      unreadMap.get(row.id) ?? 0,
    );
  }

  private formatConversationView(
    row: ChatConversation,
    buyerName: string,
    shopName: string,
    side: ChatSide,
    unreadCount: number,
  ) {
    return {
      id: row.id,
      buyerId: row.buyerId,
      buyerName,
      shopId: row.shopId,
      shopName,
      side,
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
      senderId: row.senderId,
      text: row.text,
      product: row.product
        ? {
            id: row.product.id,
            title: row.product.title ?? '',
            price: row.product.price,
            status: row.product.status,
          }
        : null,
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

  private async resolveProduct(
    manager: EntityManager,
    conversation: ChatConversation,
    productId: string,
  ) {
    const product = await manager.findOne(Product, {
      where: {
        id: productId,
        shopId: conversation.shopId,
        status: ProductStatus.ACTIVE,
      },
      relations: { category: true, shop: true },
    });
    const approved =
      product &&
      (await manager.existsBy(ProductModeration, {
        productId: product.id,
        status: ProductModerationStatus.APPROVED,
      }));
    if (
      !product ||
      !approved ||
      product.category?.isActive !== true ||
      product.shop?.status !== ShopStatus.ACTIVE
    ) {
      throw new BadRequestException(
        'Product must be a public approved listing of this Shop',
      );
    }
    return product;
  }
}
