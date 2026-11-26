import { randomUUID } from 'node:crypto';

import type { Queue } from 'bullmq';
import { firstValueFrom, take } from 'rxjs';

import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { ShopMemberRoleAssignment } from '@/modules/authorization/entities/shop-member-role-assignment.entity';
import { ShopRolePermission } from '@/modules/authorization/entities/shop-role-permission.entity';
import { ShopRole } from '@/modules/authorization/entities/shop-role.entity';
import { OUTBOX_EVENT_STATUSES } from '@/modules/event/constants/event-status.constant';
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { EventDelivery } from '@/modules/event/entities/event-delivery.entity';
import { OutboxEvent } from '@/modules/event/entities/outbox-event.entity';
import { OutboxPublisherService } from '@/modules/event/outbox-publisher.service';
import { OutboxService } from '@/modules/event/outbox.service';
import type { MailService } from '@/modules/mail/mail.service';
import { Notification } from '@/modules/notifications/entities';
import { NotificationEmailProcessor } from '@/modules/notifications/notification-email.processor';
import { NotificationEventProcessor } from '@/modules/notifications/notification-event.processor';
import { NotificationService } from '@/modules/notifications/notification.service';
import { ORDER_EVENT_ACTION } from '@/modules/order/constants/order.constant';
import { ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserStatus } from '@/modules/user/enums';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Outbox + BullMQ Notifications PostgreSQL', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => database?.destroy());

  it('publishes pending outbox events with SKIP LOCKED and updates status to enqueued', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const outbox = new OutboxService();

    await db.transaction((manager) =>
      outbox.record(manager, {
        eventType: EVENT_TYPES.ORDER_CREATED,
        resourceId: f.order.id,
        payload: {
          orderId: f.order.id,
          buyerId: f.buyer.id,
          shopId: f.shop.id,
        },
      }),
    );

    const addBulk = jest.fn(async () => []);
    const publisher = new OutboxPublisherService(db, {
      addBulk,
    } as unknown as Queue);

    const publishedCount = await publisher.publishPendingEvents();
    expect(publishedCount).toBe(1);
    expect(addBulk).toHaveBeenCalledTimes(1);

    const pendingCount = await db.getRepository(OutboxEvent).countBy({
      status: OUTBOX_EVENT_STATUSES.PENDING,
    });
    expect(pendingCount).toBe(0);
  });

  it('processes domain events idempotently via EventDelivery, emits SSE, and enqueues email jobs for important events', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const notificationService = new NotificationService(
      db.getRepository(Notification),
    );
    const emailQueueAddBulk = jest.fn<Promise<unknown[]>, [unknown[]]>(
      async () => [],
    );
    const processor = new NotificationEventProcessor(db, notificationService, {
      addBulk: emailQueueAddBulk,
    } as unknown as Queue);

    const ssePromise = firstValueFrom(
      notificationService.subscribe(f.buyer.id).pipe(take(1)),
    );

    const eventId = randomUUID();
    const jobData = {
      eventId,
      eventType: EVENT_TYPES.ORDER_CREATED,
      resourceId: f.order.id,
      payload: {
        orderId: f.order.id,
        buyerId: f.buyer.id,
        shopId: f.shop.id,
      },
    };

    const [first, second] = await Promise.all([
      processor.handleEvent(jobData),
      processor.handleEvent(jobData),
    ]);

    const totalCreated = first.length + second.length;
    expect(totalCreated).toBe(2); // buyer + shop owner
    expect(await db.getRepository(EventDelivery).countBy({ eventId })).toBe(1);
    expect(emailQueueAddBulk).toHaveBeenCalledTimes(1);
    expect(emailQueueAddBulk.mock.calls[0][0]).toHaveLength(2);

    const sseEvent = await ssePromise;
    expect(sseEvent.type).toBe(EVENT_TYPES.ORDER_CREATED);
    expect(sseEvent.data).toMatchObject({
      recipientId: f.buyer.id,
      entityId: f.order.id,
      isRead: false,
    });

    notificationService.onModuleDestroy();
  });

  it('resolves shop staff with permission and skips initial ORDER_UPDATED actions', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const role = await db.manager.save(
      ShopRole,
      db.manager.create(ShopRole, {
        shopId: f.shop.id,
        name: 'OrderStaff',
        description: null,
      }),
    );
    await db.manager.save(
      ShopRolePermission,
      db.manager.create(ShopRolePermission, {
        roleId: role.id,
        permissionKey: SHOP_PERMISSIONS.ORDER_VIEW,
      }),
    );
    const member = await db.manager.save(
      ShopMember,
      db.manager.create(ShopMember, {
        shopId: f.shop.id,
        userId: f.admin.id,
        memberRole: ShopMemberRole.STAFF,
      }),
    );
    await db.manager.save(
      ShopMemberRoleAssignment,
      db.manager.create(ShopMemberRoleAssignment, {
        memberId: member.id,
        roleId: role.id,
      }),
    );

    const notificationService = new NotificationService(
      db.getRepository(Notification),
    );
    const emailQueueAddBulk = jest.fn<Promise<unknown[]>, [unknown[]]>(
      async () => [],
    );
    const processor = new NotificationEventProcessor(db, notificationService, {
      addBulk: emailQueueAddBulk,
    } as unknown as Queue);

    const skipped = await processor.handleEvent({
      eventId: randomUUID(),
      eventType: EVENT_TYPES.ORDER_UPDATED,
      resourceId: f.order.id,
      payload: {
        orderId: f.order.id,
        orderEventId: randomUUID(),
        buyerId: f.buyer.id,
        shopId: f.shop.id,
        action: ORDER_EVENT_ACTION.PAID,
      },
    });
    expect(skipped).toHaveLength(0);

    const created = await processor.handleEvent({
      eventId: randomUUID(),
      eventType: EVENT_TYPES.ORDER_UPDATED,
      resourceId: f.order.id,
      payload: {
        orderId: f.order.id,
        orderEventId: randomUUID(),
        buyerId: f.buyer.id,
        shopId: f.shop.id,
        action: ORDER_EVENT_ACTION.ACCEPTED,
      },
    });
    const recipients = created.map((n) => n.recipientId);
    expect(recipients).toEqual(
      expect.arrayContaining([f.buyer.id, f.owner.id, f.admin.id]),
    );
    expect(emailQueueAddBulk).not.toHaveBeenCalled();

    notificationService.onModuleDestroy();
  });

  it('skips email delivery for inactive users and sends for active users', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const sendNotificationEmail = jest.fn(async () => {});
    const emailProcessor = new NotificationEmailProcessor(db, {
      sendNotificationEmail,
    } as unknown as MailService);

    await db.manager.update(User, f.buyer.id, { status: UserStatus.INACTIVE });
    await emailProcessor.handleEmail({
      notificationId: randomUUID(),
      recipientId: f.buyer.id,
      title: 'Test',
      body: 'Body',
    });
    expect(sendNotificationEmail).not.toHaveBeenCalled();

    await db.manager.update(User, f.buyer.id, { status: UserStatus.ACTIVE });
    const notificationId = randomUUID();
    await emailProcessor.handleEmail({
      notificationId,
      recipientId: f.buyer.id,
      title: 'Test',
      body: 'Body',
    });
    expect(sendNotificationEmail).toHaveBeenCalledWith(
      f.buyer.email,
      { title: 'Test', body: 'Body' },
      notificationId,
    );
  });

  it('paginates notifications, counts unread, and marks single or all notifications read', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const service = new NotificationService(db.getRepository(Notification));

    const repo = db.getRepository(Notification);
    const n1 = await repo.save(
      repo.create({
        recipientId: f.buyer.id,
        type: EVENT_TYPES.ORDER_CREATED,
        title: 'First',
        body: 'First body',
        entityType: 'order',
        entityId: f.order.id,
        isRead: false,
      }),
    );
    await repo.save(
      repo.create({
        recipientId: f.buyer.id,
        type: EVENT_TYPES.CHAT_MESSAGE_CREATED,
        title: 'Second',
        body: 'Second body',
        entityType: 'chat_conversation',
        entityId: randomUUID(),
        isRead: false,
      }),
    );

    expect(await service.getUnreadCount(f.buyer.id)).toEqual({ count: 2 });

    const page = await service.findAll(f.buyer.id, {
      path: '/notifications',
      page: 1,
      limit: 10,
    });
    expect(page.data).toHaveLength(2);

    const marked = await service.markAsRead(f.buyer.id, n1.id);
    expect(marked.isRead).toBe(true);
    expect(await service.getUnreadCount(f.buyer.id)).toEqual({ count: 1 });

    expect(await service.markAllAsRead(f.buyer.id)).toEqual({
      updatedCount: 1,
    });
    expect(await service.getUnreadCount(f.buyer.id)).toEqual({ count: 0 });
  });
});
