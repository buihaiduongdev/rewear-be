import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { MailService } from '@/modules/mail/mail.service';
import { User } from '@/modules/user/entities';

import {
  EMAIL_STATE,
  NOTIFICATION_POLICY,
} from './constants/notification.constant';
import {
  Notification,
  NotificationEmailJob,
} from './entities/notification.entity';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationEmailService {
  constructor(
    private readonly db: DataSource,
    private readonly inbox: NotificationService,
    private readonly mail: MailService,
  ) {}
  private claim() {
    return this.db.transaction(async (manager) => {
      const [{ now: timestamp }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(timestamp);
      await manager
        .createQueryBuilder()
        .update(NotificationEmailJob)
        .set({ state: EMAIL_STATE.FAILED, leaseToken: null, leasedUntil: null })
        .where(
          'state = :sending AND "leasedUntil" <= :now AND attempts >= :max',
          {
            sending: EMAIL_STATE.SENDING,
            now,
            max: NOTIFICATION_POLICY.EMAIL_MAX_ATTEMPTS,
          },
        )
        .execute();
      const job = await manager
        .createQueryBuilder(NotificationEmailJob, 'job')
        .where('job.attempts < :max', {
          max: NOTIFICATION_POLICY.EMAIL_MAX_ATTEMPTS,
        })
        .andWhere(
          '((job.state = :pending AND job.nextAttemptAt <= :now) OR (job.state = :sending AND job.leasedUntil <= :now))',
          { pending: EMAIL_STATE.PENDING, sending: EMAIL_STATE.SENDING, now },
        )
        .orderBy('job.nextAttemptAt', 'ASC')
        .addOrderBy('job.id', 'ASC')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getOne();
      if (!job) return null;
      const notification = await manager.findOneBy(Notification, {
        id: job.notificationId,
      });
      const user = notification
        ? await manager.findOneBy(User, { id: notification.recipientId })
        : null;
      if (
        !notification ||
        !user ||
        !(await this.inbox.canRead(manager, user, notification))
      ) {
        job.state = EMAIL_STATE.CANCELLED;
        job.leaseToken = null;
        job.leasedUntil = null;
        await manager.save(job);
        return { cancelled: true as const };
      }
      job.state = EMAIL_STATE.SENDING;
      job.attempts++;
      job.leaseToken = randomUUID();
      job.leasedUntil = new Date(
        now.getTime() + NOTIFICATION_POLICY.EMAIL_LEASE_MS,
      );
      await manager.save(job);
      return { cancelled: false as const, job, user, notification };
    });
  }
  async deliverOne() {
    const claimed = await this.claim();
    if (!claimed) return false;
    if (claimed.cancelled) return true;
    const { job, user, notification } = claimed;
    let sent = false;
    try {
      await this.mail.sendNotificationEmail(user.email, notification, job.id);
      sent = true;
    } catch {
      /* Raw SMTP errors may contain recipient/credentials: persist state only. */
    }
    await this.db.transaction(async (manager) => {
      const current = await manager.findOne(NotificationEmailJob, {
        where: { id: job.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !current ||
        current.leaseToken !== job.leaseToken ||
        current.state !== EMAIL_STATE.SENDING
      )
        return;
      const [{ now: timestamp }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(timestamp);
      current.state = sent
        ? EMAIL_STATE.SENT
        : current.attempts >= NOTIFICATION_POLICY.EMAIL_MAX_ATTEMPTS
          ? EMAIL_STATE.FAILED
          : EMAIL_STATE.PENDING;
      current.sentAt = sent ? now : null;
      current.leaseToken = null;
      current.leasedUntil = null;
      current.nextAttemptAt = new Date(
        now.getTime() + NOTIFICATION_POLICY.EMAIL_RETRY_MS * current.attempts,
      );
      await manager.save(current);
    });
    return true;
  }
  async run() {
    let count = 0;
    while (count < NOTIFICATION_POLICY.BATCH_SIZE && (await this.deliverOne()))
      count++;
    return count;
  }
}
