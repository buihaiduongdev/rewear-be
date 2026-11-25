import { randomUUID } from 'node:crypto';

import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { DisputeNotice } from '@/modules/dispute/entities/dispute.entity';
import type { MailService } from '@/modules/mail/mail.service';
import {
  Notification,
  NotificationEmailJob,
  NotificationEvent,
} from '@/modules/notifications/entities';
import { NotificationEmailService } from '@/modules/notifications/notification-email.service';
import { NotificationProjector } from '@/modules/notifications/notification-projector.service';
import { NotificationService } from '@/modules/notifications/notification.service';
import { publishNotification } from '@/modules/notifications/publish-notification';
import { Order } from '@/modules/order/entities/order.entity';
import { FulfillmentNotice } from '@/modules/shipment/entities/late-handover.entity';
import { ShopMember } from '@/modules/shop/entities';
import { ShopInvitation } from '@/modules/shop/entities/shop-invitation.entity';
import { ShopInvitationStatus } from '@/modules/shop/enums/shop-invitation-status.enum';
import { User } from '@/modules/user/entities';
import { UserStatus } from '@/modules/user/enums';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Central notifications PostgreSQL', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => database?.destroy());
  it('retains inactive recipients inbox but blocks reading and email until authorized', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    await db.manager.clear(NotificationEmailJob);
    await db.manager.update(User, f.buyer.id, { status: UserStatus.INACTIVE });
    const input = {
      key: randomUUID(),
      kind: 'SHOP_INVITATION',
      sourceId: randomUUID(),
      title: 'Lời mời',
      body: 'Mở Rewear.',
      mode: null,
      email: true,
      recipients: [{ userId: f.buyer.id, scope: 'USER' as const }],
    };
    await Promise.all([
      db.transaction((m) => publishNotification(m, input)),
      db.transaction((m) => publishNotification(m, input)),
    ]);
    expect(
      await db.manager.countBy(Notification, { eventKey: input.key }),
    ).toBe(1);
    const service = new NotificationService(db, new AuthorizationService(db));
    await expect(service.unread(f.buyer.id)).rejects.toThrow(
      'Active user required',
    );
    const send = jest.fn(async () => {});
    const worker = new NotificationEmailService(db, service, {
      sendNotificationEmail: send,
    } as unknown as MailService);
    await worker.deliverOne();
    expect(send).not.toHaveBeenCalled();
    await db.manager.update(User, f.buyer.id, { status: UserStatus.ACTIVE });
    expect((await service.unread(f.buyer.id)).count).toBe(1);
  });
  it('recovers expired leases and terminalizes exhausted crashed attempts', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    await db.manager.clear(NotificationEmailJob);
    await db.transaction((m) =>
      publishNotification(m, {
        key: randomUUID(),
        kind: 'SHOP_INVITATION',
        sourceId: randomUUID(),
        title: 'Lời mời',
        body: 'Mở Rewear.',
        mode: null,
        email: true,
        recipients: [{ userId: f.buyer.id, scope: 'USER' }],
      }),
    );
    const job = await db.manager.findOneByOrFail(NotificationEmailJob, {
      state: 'PENDING',
    });
    await db.manager.update(NotificationEmailJob, job.id, {
      state: 'SENDING',
      attempts: 1,
      leaseToken: randomUUID(),
      leasedUntil: new Date(0),
    });
    const send = jest.fn(async () => {});
    const worker = new NotificationEmailService(
      db,
      new NotificationService(db, new AuthorizationService(db)),
      { sendNotificationEmail: send } as unknown as MailService,
    );
    await worker.deliverOne();
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await db.manager.findOneByOrFail(NotificationEmailJob, { id: job.id }),
    ).toMatchObject({ state: 'SENT', attempts: 2 });
    await db.manager.update(NotificationEmailJob, job.id, {
      state: 'SENDING',
      attempts: 5,
      leaseToken: randomUUID(),
      leasedUntil: new Date(0),
    });
    expect(await worker.deliverOne()).toBe(false);
    expect(
      await db.manager.findOneByOrFail(NotificationEmailJob, { id: job.id }),
    ).toMatchObject({ state: 'FAILED', leaseToken: null });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('resolves dispute targets for each audience and labels sandbox fulfillment without coin redemption', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    await db.manager.update(Order, f.order.id, {
      paymentMethod: 'MOMO',
      coinMode: null,
    });
    const notices = await db.manager.save(
      DisputeNotice,
      ['BUYER', 'SHOP', 'ADMIN'].map((audience) =>
        db.manager.create(DisputeNotice, {
          issueId: f.issue.id,
          action: 'OPENED',
          audience: audience as DisputeNotice['audience'],
          eventKey: randomUUID(),
          reason: 'SECRET PRIVATE EVIDENCE',
        }),
      ),
    );
    const fulfillment = await db.manager.save(
      FulfillmentNotice,
      db.manager.create(FulfillmentNotice, {
        orderId: f.order.id,
        recipientId: f.buyer.id,
        action: 'OVERDUE',
        reason: 'SECRET PRIVATE EVIDENCE',
      }),
    );
    await new NotificationProjector(db).run();
    const buyerNotice = await db.manager.findOneByOrFail(Notification, {
      eventKey: 'dispute:' + notices[0].id,
      recipientId: f.buyer.id,
    });
    const adminNotice = await db.manager.findOneByOrFail(Notification, {
      eventKey: 'dispute:' + notices[2].id,
      recipientId: f.admin.id,
    });
    expect(buyerNotice).toMatchObject({
      sourceId: f.order.id,
      targetType: 'ORDER',
      mode: 'SIMULATION',
    });
    expect(adminNotice).toMatchObject({
      sourceId: f.row.id,
      targetType: 'DISPUTE_CASE',
    });
    expect(buyerNotice.body).not.toContain('SECRET');
    expect(
      await db.manager.findOneByOrFail(Notification, {
        eventKey: 'fulfillment:' + fulfillment.id,
      }),
    ).toMatchObject({
      mode: 'SIMULATION',
      sourceId: f.order.id,
      targetType: 'ORDER',
    });
  });
  it('persists once, rolls back with the domain transaction, and isolates recipient unread/read operations', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const input = {
      key: randomUUID(),
      kind: 'ORDER_CREATED',
      sourceId: f.order.id,
      title: 'Đơn hàng mới',
      body: 'Có cập nhật đơn hàng.',
      mode: null,
      recipients: [{ userId: f.buyer.id, scope: 'USER' as const }],
    };
    await db.transaction(async (m) => {
      await publishNotification(m, input);
      await publishNotification(m, input);
    });
    const service = new NotificationService(db, new AuthorizationService(db));
    expect(await service.unread(f.buyer.id)).toEqual({ count: 1 });
    expect(await service.unread(f.owner.id)).toEqual({ count: 0 });
    const page = await service.list(f.buyer.id, {
      limit: 50,
      offset: 0,
      unreadOnly: false,
    });
    await expect(service.read(f.owner.id, page.items[0].id)).rejects.toThrow(
      'Notification not found',
    );
    await service.read(f.buyer.id, page.items[0].id);
    await service.read(f.buyer.id, page.items[0].id);
    expect(await service.unread(f.buyer.id)).toEqual({ count: 0 });
    await expect(
      db.transaction(async (m) => {
        await publishNotification(m, {
          ...input,
          key: 'rollback-' + input.key,
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(
      await db.manager.countBy(NotificationEvent, {
        key: 'rollback-' + input.key,
      }),
    ).toBe(0);
  });
  it('hides Shop notices after membership revocation and refuses same-key changed recipients', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const key = randomUUID();
    const input = {
      key,
      kind: 'ORDER_CREATED',
      sourceId: f.order.id,
      title: 'Đơn hàng mới',
      body: 'Có cập nhật đơn hàng.',
      mode: null,
      recipients: [
        {
          userId: f.owner.id,
          scope: 'SHOP' as const,
          shopId: f.shop.id,
          permission: SHOP_PERMISSIONS.ORDER_VIEW,
        },
      ],
    };
    await db.transaction((m) => publishNotification(m, input));
    await expect(
      db.transaction((m) =>
        publishNotification(m, {
          ...input,
          recipients: [{ userId: f.buyer.id, scope: 'USER' as const }],
        }),
      ),
    ).rejects.toThrow('Notification event payload changed');
    const service = new NotificationService(db, new AuthorizationService(db));
    expect((await service.unread(f.owner.id)).count).toBe(1);
    await db.manager.delete(ShopMember, {
      userId: f.owner.id,
      shopId: f.shop.id,
    });
    expect((await service.unread(f.owner.id)).count).toBe(0);
    expect(
      (
        await service.list(f.owner.id, {
          limit: 50,
          offset: 0,
          unreadOnly: false,
        })
      ).items,
    ).toHaveLength(0);
    expect(
      await db.manager.countBy(Notification, {
        recipientId: f.buyer.id,
        eventKey: key,
      }),
    ).toBe(0);
  });
  it('projects durable order/invitation sources once across workers and suppresses old-source emails', async () => {
    const db = database.dataSource;
    const projector = new NotificationProjector(db);
    await projector.initialize();
    const f = await adjudicationFixture(db);
    const invitation = await db.manager.save(
      ShopInvitation,
      db.manager.create(ShopInvitation, {
        shopId: f.shop.id,
        userId: f.buyer.id,
        roleIds: [],
        status: ShopInvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 60000),
      }),
    );
    await Promise.all([projector.run(), new NotificationProjector(db).run()]);
    await projector.run();
    expect(
      await db.manager.countBy(NotificationEvent, {
        key: 'order-created:' + f.order.id,
      }),
    ).toBe(1);
    expect(
      await db.manager.countBy(Notification, {
        eventKey: 'order-created:' + f.order.id,
      }),
    ).toBe(2);
    const invitationNotice = await db.manager.findOneByOrFail(Notification, {
      sourceId: invitation.id,
      recipientId: f.buyer.id,
    });
    expect(
      await db.manager.countBy(NotificationEmailJob, {
        notificationId: invitationNotice.id,
      }),
    ).toBe(1);
    const oldOrderNotices = await db.manager.findBy(Notification, {
      eventKey: 'order-created:' + f.order.id,
    });
    for (const notice of oldOrderNotices)
      expect(
        await db.manager.countBy(NotificationEmailJob, {
          notificationId: notice.id,
        }),
      ).toBe(0);
  });
  it('leases one email once across workers and cancels delivery after permission revocation', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    await db.manager.clear(NotificationEmailJob);
    await db.transaction((m) =>
      publishNotification(m, {
        key: randomUUID(),
        kind: 'ORDER_CREATED',
        sourceId: f.order.id,
        title: 'Đơn hàng mới',
        body: 'Mở Rewear để xem.',
        mode: 'SIMULATION',
        email: true,
        recipients: [
          {
            userId: f.owner.id,
            scope: 'SHOP',
            shopId: f.shop.id,
            permission: SHOP_PERMISSIONS.ORDER_VIEW,
          },
        ],
      }),
    );
    const send = jest.fn(async () => {});
    const inbox = new NotificationService(db, new AuthorizationService(db));
    const worker = () =>
      new NotificationEmailService(db, inbox, {
        sendNotificationEmail: send,
      } as unknown as MailService);
    await Promise.all([worker().deliverOne(), worker().deliverOne()]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await db.manager.countBy(NotificationEmailJob, { state: 'SENT' }),
    ).toBe(1);
    await db.transaction((m) =>
      publishNotification(m, {
        key: randomUUID(),
        kind: 'ORDER_CREATED',
        sourceId: f.order.id,
        title: 'Đơn hàng mới',
        body: 'Mở Rewear để xem.',
        mode: null,
        email: true,
        recipients: [
          {
            userId: f.owner.id,
            scope: 'SHOP',
            shopId: f.shop.id,
            permission: SHOP_PERMISSIONS.ORDER_VIEW,
          },
        ],
      }),
    );
    await db.manager.delete(ShopMember, { userId: f.owner.id });
    await worker().deliverOne();
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await db.manager.countBy(NotificationEmailJob, { state: 'CANCELLED' }),
    ).toBe(1);
  });
  it('retries SMTP failures durably with stable message identity and stops after the limit', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    await db.manager.clear(NotificationEmailJob);
    await db.transaction((m) =>
      publishNotification(m, {
        key: randomUUID(),
        kind: 'SHOP_INVITATION',
        sourceId: randomUUID(),
        title: 'Lời mời',
        body: 'Mở Rewear.',
        mode: null,
        email: true,
        recipients: [{ userId: f.buyer.id, scope: 'USER' }],
      }),
    );
    const send = jest.fn(
      async (_email: string, _notice: Notification, _jobId: string) => {
        throw new Error('SMTP unavailable');
      },
    );
    const worker = new NotificationEmailService(
      db,
      new NotificationService(db, new AuthorizationService(db)),
      { sendNotificationEmail: send } as unknown as MailService,
    );
    for (let i = 0; i < 5; i++) {
      await db.manager
        .createQueryBuilder()
        .update(NotificationEmailJob)
        .set({ nextAttemptAt: new Date(0) })
        .where('state = :state', { state: 'PENDING' })
        .execute();
      await worker.deliverOne();
    }
    expect(send).toHaveBeenCalledTimes(5);
    expect(new Set(send.mock.calls.map((call) => call[2])).size).toBe(1);
    expect(
      await db.manager.findOneByOrFail(NotificationEmailJob, {
        state: 'FAILED',
      }),
    ).toMatchObject({ attempts: 5, leaseToken: null });
    expect(await worker.deliverOne()).toBe(false);
  });
});
