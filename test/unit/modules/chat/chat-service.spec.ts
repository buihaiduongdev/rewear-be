import { randomUUID } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';

import { DataSource, type EntityManager, EntityNotFoundError } from 'typeorm';

import type { AuthorizationService } from '@/modules/authorization/authorization.service';
import { ChatService } from '@/modules/chat/chat.service';
import { ChatConversation, ChatMessage } from '@/modules/chat/entities';
import { ChatMessageMedia } from '@/modules/chat/entities/chat-message-media.entity';
import { chatMessageViewSchema } from '@/modules/chat/schemas/chat.schema';
import type { OutboxService } from '@/modules/event/outbox.service';
import type { MediaService } from '@/modules/media/media.service';
import { Order } from '@/modules/order/entities';
import { User } from '@/modules/user/entities';
import { UserStatus } from '@/modules/user/enums';

function buildFixture() {
  const buyerId = randomUUID();
  const shopId = randomUUID();
  const conversationId = randomUUID();
  const orderId = randomUUID();
  const messageId = randomUUID();
  const now = new Date('2026-11-26T10:00:00.000Z');

  const conversation = {
    id: conversationId,
    buyerId,
    shopId,
    buyerLastReadAt: null,
    shopLastReadAt: null,
    lastMessageAt: null,
  } as ChatConversation;

  const order = {
    id: orderId,
    orderCode: 'RW-1234567890',
    buyerId,
    shopId,
    status: 'PENDING_CONFIRMATION',
    total: 350000,
    items: [{ productId: randomUUID() }, { productId: randomUUID() }],
  } as unknown as Order;

  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };

  const manager = {
    findOneBy: jest.fn((entity: unknown) => {
      if (entity === ChatConversation) return Promise.resolve(conversation);
      if (entity === User)
        return Promise.resolve({ id: buyerId, status: UserStatus.ACTIVE });
      return Promise.resolve(null);
    }),
    findOneByOrFail: jest.fn((entity: unknown) => {
      if (entity === Order) return Promise.resolve(order);
      return Promise.reject(new EntityNotFoundError(Order, { id: orderId }));
    }),
    create: jest.fn((_entity: unknown, payload: Record<string, unknown>) => ({
      id: messageId,
      createdAt: now,
      ...payload,
    })),
    save: jest.fn((_entity: unknown, row: unknown) => Promise.resolve(row)),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    find: jest.fn((entity: unknown) => {
      if (entity === ChatMessageMedia) return Promise.resolve([]);
      return Promise.resolve([]);
    }),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  } as unknown as EntityManager;

  const db = {
    manager,
    transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager),
    ),
  } as unknown as DataSource;

  const outbox = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new ChatService(
    db,
    {
      hasPermission: jest.fn().mockResolvedValue(false),
    } as unknown as AuthorizationService,
    { verifyMedia: jest.fn() } as unknown as MediaService,
    outbox as unknown as OutboxService,
  );

  return {
    service,
    manager,
    queryBuilder,
    outbox,
    buyerId,
    shopId,
    conversationId,
    orderId,
    messageId,
    order,
    now,
  };
}

describe('ChatService order-card attachment', () => {
  it('sends an order-card message when the order belongs to the conversation buyer and shop', async () => {
    const f = buildFixture();

    const result = await f.service.send(f.buyerId, f.conversationId, {
      text: 'Kiểm tra giúp mình đơn này',
      mediaIds: [],
      orderId: f.orderId,
    });

    expect(f.manager.findOneByOrFail).toHaveBeenCalledWith(Order, {
      id: f.orderId,
    });
    expect(f.manager.create).toHaveBeenCalledWith(
      ChatMessage,
      expect.objectContaining({
        conversationId: f.conversationId,
        senderId: f.buyerId,
        orderId: f.orderId,
        order: f.order,
      }),
    );
    expect(result.orderId).toBe(f.orderId);
    expect(result.order).toEqual({
      id: f.orderId,
      orderCode: 'RW-1234567890',
      status: 'PENDING_CONFIRMATION',
      total: 350000,
      itemCount: 2,
    });
    expect(chatMessageViewSchema.safeParse(result).success).toBe(true);
  });

  it('rejects when the referenced order does not exist', async () => {
    const f = buildFixture();
    (f.manager.findOneByOrFail as jest.Mock).mockRejectedValueOnce(
      new EntityNotFoundError(Order, { id: f.orderId }),
    );

    await expect(
      f.service.send(f.buyerId, f.conversationId, {
        mediaIds: [],
        orderId: f.orderId,
      }),
    ).rejects.toThrow(EntityNotFoundError);
    expect(f.manager.save).not.toHaveBeenCalled();
  });

  it('rejects when the order belongs to a different buyer', async () => {
    const f = buildFixture();
    (f.manager.findOneByOrFail as jest.Mock).mockResolvedValueOnce({
      ...f.order,
      buyerId: randomUUID(),
    });

    await expect(
      f.service.send(f.buyerId, f.conversationId, {
        mediaIds: [],
        orderId: f.orderId,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(f.manager.save).not.toHaveBeenCalled();
  });

  it('rejects when the order belongs to a different shop', async () => {
    const f = buildFixture();
    (f.manager.findOneByOrFail as jest.Mock).mockResolvedValueOnce({
      ...f.order,
      shopId: randomUUID(),
    });

    await expect(
      f.service.send(f.buyerId, f.conversationId, {
        mediaIds: [],
        orderId: f.orderId,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(f.manager.save).not.toHaveBeenCalled();
  });

  it('returns null order fields for text-only messages', async () => {
    const f = buildFixture();

    const result = await f.service.send(f.buyerId, f.conversationId, {
      text: 'Xin chào shop',
      mediaIds: [],
    });

    expect(f.manager.findOneByOrFail).not.toHaveBeenCalled();
    expect(result.orderId).toBeNull();
    expect(result.order).toBeNull();
    expect(chatMessageViewSchema.safeParse(result).success).toBe(true);
  });

  it('loads order previews via leftJoinAndSelect when listing messages', async () => {
    const f = buildFixture();
    const orderMsg = {
      id: randomUUID(),
      conversationId: f.conversationId,
      senderId: f.buyerId,
      text: null,
      productId: null,
      product: null,
      orderId: f.orderId,
      order: f.order,
      createdAt: f.now,
    };
    const plainMsg = {
      id: randomUUID(),
      conversationId: f.conversationId,
      senderId: f.buyerId,
      text: 'Cảm ơn shop',
      productId: null,
      product: null,
      orderId: null,
      order: null,
      createdAt: f.now,
    };
    f.queryBuilder.getManyAndCount.mockResolvedValueOnce([
      [plainMsg, orderMsg],
      2,
    ]);

    const page = await f.service.messages(f.buyerId, f.conversationId, {
      limit: 20,
      offset: 0,
    });

    expect(f.queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'message.order',
      'order',
    );
    expect(page.total).toBe(2);
    expect(page.items[0].orderId).toBe(f.orderId);
    expect(page.items[0].order).toEqual({
      id: f.orderId,
      orderCode: 'RW-1234567890',
      status: 'PENDING_CONFIRMATION',
      total: 350000,
      itemCount: 2,
    });
    expect(page.items[1].orderId).toBeNull();
    expect(page.items[1].order).toBeNull();
  });
});
