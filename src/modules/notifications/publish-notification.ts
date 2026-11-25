import { createHash } from 'node:crypto';

import { ConflictException } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { User } from '@/modules/user/entities';

import {
  EMAIL_STATE,
  NOTIFICATION_SCOPE,
  NOTIFICATION_TARGET,
} from './constants/notification.constant';
import {
  Notification,
  NotificationEmailJob,
  NotificationEvent,
} from './entities';
import type { NotificationInput } from './schemas/notification.schema';

/** Caller transaction commits the source event, inbox and email intent atomically. */
export async function publishNotification(
  manager: EntityManager,
  input: NotificationInput,
) {
  if (!manager.queryRunner?.isTransactionActive)
    throw new Error('Notification publisher requires transaction');
  const recipients = [...input.recipients].sort((a, b) =>
    a.userId.localeCompare(b.userId),
  );
  const invalidRecipients =
    new Set(recipients.map((row) => row.userId)).size !== recipients.length ||
    recipients.some(
      (row) =>
        row.scope === NOTIFICATION_SCOPE.SHOP &&
        (!row.shopId || !row.permission),
    );
  if (invalidRecipients)
    throw new Error('Invalid notification recipient scope');
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ ...input, recipients, email: !!input.email }))
    .digest('hex');
  const insertResult = await manager
    .createQueryBuilder()
    .insert()
    .into(NotificationEvent)
    .values({ key: input.key, fingerprint })
    .orIgnore()
    .returning(['id'])
    .execute();
  const event = await manager.findOneByOrFail(NotificationEvent, {
    key: input.key,
  });
  if (insertResult.raw.length === 0) {
    if (event.fingerprint !== fingerprint)
      throw new ConflictException('Notification event payload changed');
    return event;
  }
  for (const recipient of recipients) {
    if (
      !(await manager.existsBy(User, {
        id: recipient.userId,
      }))
    )
      continue;
    const notification = await manager.save(
      Notification,
      manager.create(Notification, {
        eventKey: input.key,
        targetType: input.targetType ?? NOTIFICATION_TARGET.INBOX,
        recipientId: recipient.userId,
        scope: recipient.scope,
        shopId: recipient.shopId ?? null,
        permission: recipient.permission ?? null,
        kind: input.kind,
        sourceId: input.sourceId,
        title: input.title,
        body: input.body,
        mode: input.mode,
        readAt: null,
        createdAt: input.occurredAt,
      }),
    );
    if (input.email)
      await manager.save(
        NotificationEmailJob,
        manager.create(NotificationEmailJob, {
          notificationId: notification.id,
          state: EMAIL_STATE.PENDING,
          attempts: 0,
          nextAttemptAt: event.createdAt,
          leaseToken: null,
          leasedUntil: null,
          sentAt: null,
        }),
      );
  }
  return event;
}
