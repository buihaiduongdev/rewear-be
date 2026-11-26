import { randomUUID } from 'node:crypto';

import type { Queue } from 'bullmq';
import { firstValueFrom, take } from 'rxjs';
import type { DataSource, Repository } from 'typeorm';

import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import type { MailService } from '@/modules/mail/mail.service';
import type { Notification } from '@/modules/notifications/entities';
import { NotificationEmailProcessor } from '@/modules/notifications/notification-email.processor';
import { NotificationEventProcessor } from '@/modules/notifications/notification-event.processor';
import { NotificationController } from '@/modules/notifications/notification.controller';
import { NotificationService } from '@/modules/notifications/notification.service';
import type { User } from '@/modules/user/entities';

describe('Notification unit suite', () => {
  it('NotificationService emits to matching recipient stream and delegates queries', async () => {
    const repo = {
      count: jest.fn(async () => 3),
      update: jest.fn(async () => ({ affected: 2 })),
      findOneBy: jest.fn(async () => null),
    } as unknown as Repository<Notification>;
    const service = new NotificationService(repo);
    const userId = randomUUID();
    const otherId = randomUUID();

    const nextEvent = firstValueFrom(service.subscribe(userId).pipe(take(1)));
    const now = new Date();
    service.emit([
      {
        id: randomUUID(),
        recipientId: otherId,
        type: EVENT_TYPES.ORDER_CREATED,
        title: 'Other',
        body: 'Other',
        entityType: 'order',
        entityId: randomUUID(),
        isRead: false,
        createdAt: now,
        updatedAt: now,
      } as Notification,
      {
        id: randomUUID(),
        recipientId: userId,
        type: EVENT_TYPES.SHOP_INVITATION_CREATED,
        title: 'Invite',
        body: 'Body',
        entityType: 'shop_invitation',
        entityId: randomUUID(),
        isRead: false,
        createdAt: now,
        updatedAt: now,
      } as Notification,
    ]);

    const event = await nextEvent;
    expect(event.type).toBe(EVENT_TYPES.SHOP_INVITATION_CREATED);
    expect(await service.getUnreadCount(userId)).toEqual({ count: 3 });
    expect(await service.markAllAsRead(userId)).toEqual({ updatedCount: 2 });
    await expect(service.markAsRead(userId, randomUUID())).rejects.toThrow(
      'Notification not found',
    );

    const controller = new NotificationController(service);
    expect(await controller.getUnreadCount({ id: userId } as User)).toEqual({
      count: 3,
    });
    service.onModuleDestroy();
  });

  it('NotificationEventProcessor skips duplicate deliveries and NotificationEmailProcessor calls MailService', async () => {
    const insertQb = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ raw: [] })),
    };
    const dataSource = {
      transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
        fn({ createQueryBuilder: () => insertQb }),
      ),
      manager: {
        findOneBy: jest.fn(async () => ({
          id: 'u1',
          email: 'user@test.local',
        })),
      },
    } as unknown as DataSource;

    const service = { emit: jest.fn() } as unknown as NotificationService;
    const addBulk = jest.fn();
    const eventProcessor = new NotificationEventProcessor(dataSource, service, {
      addBulk,
    } as unknown as Queue);

    const created = await eventProcessor.handleEvent({
      eventId: randomUUID(),
      eventType: EVENT_TYPES.SHOP_INVITATION_CREATED,
      resourceId: randomUUID(),
      payload: {
        invitationId: randomUUID(),
        shopId: randomUUID(),
        userId: randomUUID(),
      },
    });
    expect(created).toEqual([]);
    expect(addBulk).not.toHaveBeenCalled();

    const sendNotificationEmail = jest.fn(async () => {});
    const emailProcessor = new NotificationEmailProcessor(dataSource, {
      sendNotificationEmail,
    } as unknown as MailService);
    await emailProcessor.handleEmail({
      notificationId: 'n1',
      recipientId: 'u1',
      title: 'Hello',
      body: 'World',
    });
    expect(sendNotificationEmail).toHaveBeenCalledWith(
      'user@test.local',
      { title: 'Hello', body: 'World' },
      'n1',
    );
  });
});
