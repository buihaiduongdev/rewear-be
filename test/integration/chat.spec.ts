import { randomUUID } from 'node:crypto';

import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { ShopMemberRoleAssignment } from '@/modules/authorization/entities/shop-member-role-assignment.entity';
import { ShopRolePermission } from '@/modules/authorization/entities/shop-role-permission.entity';
import { ShopRole } from '@/modules/authorization/entities/shop-role.entity';
import { Category } from '@/modules/category/entities';
import { ChatService } from '@/modules/chat/chat.service';
import { ChatConversation, ChatMessage } from '@/modules/chat/entities';
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxEvent } from '@/modules/event/entities/outbox-event.entity';
import { OutboxService } from '@/modules/event/outbox.service';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole, ShopStatus } from '@/modules/shop/enums';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Buyer–Shop chat PostgreSQL', () => {
  let database: TestDatabase;
  let service: ChatService;
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new ChatService(
      database.dataSource,
      new AuthorizationService(database.dataSource),
      {} as never,
      new OutboxService(),
      {} as never,
    );
  });
  afterAll(async () => database?.destroy());
  it('allows only currently public approved product attachments from the same Shop', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const thread = await service.open(f.buyer.id, f.shop.id);
    const category = await db.manager.save(
      Category,
      db.manager.create(Category, {
        name: 'Chat category',
        slug: randomUUID(),
        isActive: true,
      }),
    );
    const product = await db.manager.save(
      Product,
      db.manager.create(Product, {
        shopId: f.shop.id,
        title: 'Áo khoác',
        price: 200000,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
      }),
    );
    const moderation = await db.manager.save(
      ProductModeration,
      db.manager.create(ProductModeration, {
        productId: product.id,
        status: ProductModerationStatus.APPROVED,
        version: 1,
        reason: null,
      }),
    );
    const sent = await service.send(f.buyer.id, thread.id, {
      mediaIds: [],
      productId: product.id,
    });
    expect(sent.product).toEqual({
      id: product.id,
      title: 'Áo khoác',
      price: 200000,
      status: 'ACTIVE',
    });
    await db.manager.update(ProductModeration, moderation.id, {
      status: ProductModerationStatus.DRAFT,
    });
    await expect(
      service.send(f.buyer.id, thread.id, {
        mediaIds: [],
        productId: product.id,
      }),
    ).rejects.toThrow('public approved listing');
    expect(
      (await service.messages(f.owner.id, thread.id, { limit: 50, offset: 0 }))
        .items[0].product?.title,
    ).toBe('Áo khoác');
    await db.manager.update(ProductModeration, moderation.id, {
      status: ProductModerationStatus.APPROVED,
    });
    await db.manager.update(Category, category.id, { isActive: false });
    await expect(
      service.send(f.buyer.id, thread.id, {
        mediaIds: [],
        productId: product.id,
      }),
    ).rejects.toThrow('public approved listing');
    await db.manager.update(Category, category.id, { isActive: true });
    await db.manager.update(Shop, f.shop.id, { status: ShopStatus.INACTIVE });
    await expect(
      service.send(f.owner.id, thread.id, {
        mediaIds: [],
        productId: product.id,
      }),
    ).rejects.toThrow('public approved listing');
  });
  it('creates one conversation per buyer/Shop even under concurrent retries', async () => {
    const f = await adjudicationFixture(database.dataSource);
    const [a, b] = await Promise.all([
      service.open(f.buyer.id, f.shop.id),
      service.open(f.buyer.id, f.shop.id),
    ]);
    expect(a.id).toBe(b.id);
    expect(
      await database.dataSource.manager.countBy(ChatConversation, {
        buyerId: f.buyer.id,
        shopId: f.shop.id,
      }),
    ).toBe(1);
  });
  it('enforces participants and current Shop permissions on read and send', async () => {
    const f = await adjudicationFixture(database.dataSource);
    const other = await adjudicationFixture(database.dataSource);
    const thread = await service.open(f.buyer.id, f.shop.id);
    await expect(
      service.messages(other.buyer.id, thread.id, { limit: 50, offset: 0 }),
    ).rejects.toThrow('Chat access denied');
    await service.send(f.owner.id, thread.id, {
      text: 'Shop trả lời',
      mediaIds: [],
    });
    await database.dataSource.manager.delete(ShopMember, {
      userId: f.owner.id,
      shopId: f.shop.id,
    });
    await expect(
      service.messages(f.owner.id, thread.id, { limit: 50, offset: 0 }),
    ).rejects.toThrow('Chat access denied');
  });
  it('tracks unread count and marks conversation read using timestamps', async () => {
    const f = await adjudicationFixture(database.dataSource);
    const thread = await service.open(f.buyer.id, f.shop.id);
    await service.send(f.buyer.id, thread.id, {
      text: 'Xin chào',
      mediaIds: [],
    });
    expect((await service.detail(f.owner.id, thread.id)).unreadCount).toBe(1);
    await service.send(f.owner.id, thread.id, {
      text: 'Chào bạn',
      mediaIds: [],
    });
    expect((await service.detail(f.buyer.id, thread.id)).unreadCount).toBe(1);
    await service.read(f.buyer.id, thread.id);
    expect((await service.detail(f.buyer.id, thread.id)).unreadCount).toBe(0);
    expect(
      await database.dataSource.manager.countBy(ChatMessage, {
        conversationId: thread.id,
      }),
    ).toBe(2);
  });
  it('allows only explicitly granted Staff to read/send as Shop and revokes their central notices', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const thread = await service.open(f.buyer.id, f.shop.id);
    const member = await db.manager.findOneByOrFail(ShopMember, {
      userId: f.owner.id,
    });
    await db.manager.update(ShopMember, member.id, {
      memberRole: ShopMemberRole.STAFF,
    });
    await expect(service.detail(f.owner.id, thread.id)).rejects.toThrow(
      'Chat access denied',
    );
    const role = await db.manager.save(
      ShopRole,
      db.manager.create(ShopRole, { shopId: f.shop.id, name: 'Chat support' }),
    );
    await db.manager.save(
      ShopMemberRoleAssignment,
      db.manager.create(ShopMemberRoleAssignment, {
        memberId: member.id,
        roleId: role.id,
      }),
    );
    await db.manager.save(
      ShopRolePermission,
      db.manager.create(ShopRolePermission, {
        roleId: role.id,
        permissionKey: SHOP_PERMISSIONS.CHAT_MANAGE,
      }),
    );
    await service.send(f.buyer.id, thread.id, {
      text: 'Hỗ trợ giúp tôi',
      mediaIds: [],
    });
    expect((await service.detail(f.owner.id, thread.id)).side).toBe('SHOP');
    expect(
      await db.getRepository(OutboxEvent).countBy({
        eventType: EVENT_TYPES.CHAT_MESSAGE_CREATED,
        resourceId: thread.id,
      }),
    ).toBe(1);
    await db.manager.delete(ShopRolePermission, { roleId: role.id });
    await expect(
      service.send(f.owner.id, thread.id, {
        text: 'Không còn quyền',
        mediaIds: [],
      }),
    ).rejects.toThrow('Chat access denied');
  });
  it('paginates messages and preserves support chat when the Shop stops new business', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const thread = await service.open(f.buyer.id, f.shop.id);
    for (let i = 0; i < 4; i++)
      await service.send(f.buyer.id, thread.id, {
        text: `Message ${i}`,
        mediaIds: [],
      });
    const latest = await service.messages(f.buyer.id, thread.id, {
      limit: 2,
      offset: 0,
    });
    expect(latest.items.map((row) => row.text)).toEqual([
      'Message 2',
      'Message 3',
    ]);
    expect(latest.total).toBe(4);
    const older = await service.messages(f.buyer.id, thread.id, {
      limit: 2,
      offset: 2,
    });
    expect(older.items.map((row) => row.text)).toEqual([
      'Message 0',
      'Message 1',
    ]);
    await db.manager.update(Shop, f.shop.id, { status: ShopStatus.INACTIVE });
    expect((await service.open(f.buyer.id, f.shop.id)).id).toBe(thread.id);
    await service.send(f.owner.id, thread.id, {
      text: 'Tiếp tục hỗ trợ đơn cũ',
      mediaIds: [],
    });
  });
});
