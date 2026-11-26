import { Injectable, Logger } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { NOTIFICATION_POLICY } from './constants/notification.constant';
import { NotificationCheckpoint, NotificationEvent } from './entities';
import { publishNotification } from './publish-notification';
import {
  type NotificationSource,
  notificationSources,
} from './sources/notification-sources';

@Injectable()
export class NotificationProjector {
  private readonly cursors = new Map<string, string>();
  private readonly logger = new Logger(NotificationProjector.name);
  constructor(private readonly db: DataSource) {}
  async initialize() {
    await this.db.manager
      .createQueryBuilder()
      .insert()
      .into(NotificationCheckpoint)
      .values({ name: 'central-notifications' })
      .orIgnore()
      .execute();
    return this.db.manager.findOneByOrFail(NotificationCheckpoint, {
      name: 'central-notifications',
    });
  }
  async run() {
    const checkpoint = await this.initialize();
    let projected = 0;
    for (const source of notificationSources) {
      projected += await this.projectSource(source, checkpoint.createdAt);
    }
    return projected;
  }
  private async projectSource(source: NotificationSource, emailSince: Date) {
    const query = this.db.manager
      .createQueryBuilder(source.entity, 'source')
      .where((q) => {
        const sub = q
          .subQuery()
          .select('1')
          .from(NotificationEvent, 'event')
          .where('event.key = (:prefix || source.id::text)')
          .getQuery();
        return `NOT EXISTS ${sub}`;
      })
      .setParameter('prefix', source.prefix);
    const cursor = this.cursors.get(source.prefix);
    if (cursor) query.andWhere('source.id > :id', { id: cursor });
    const candidates = await query
      .orderBy('source.id', 'ASC')
      .take(NOTIFICATION_POLICY.BATCH_SIZE)
      .getMany();
    let count = 0;
    for (const candidate of candidates) {
      this.cursors.set(source.prefix, candidate.id);
      try {
        await this.db.transaction(async (manager) => {
          const key = source.prefix + candidate.id;
          if (await manager.existsBy(NotificationEvent, { key })) return;
          const row = await manager.findOneByOrFail(source.entity, {
            id: candidate.id,
          });
          const input = await source.build(manager, row);
          await publishNotification(manager, {
            ...input,
            key,
            occurredAt: row.createdAt,
            email: !!source.importantEmail && row.createdAt >= emailSince,
          });
          count++;
        });
      } catch {
        this.logger.error(
          `Notification source requires retry: ${source.prefix}${candidate.id}`,
        );
      }
    }
    if (candidates.length < NOTIFICATION_POLICY.BATCH_SIZE)
      this.cursors.delete(source.prefix);
    return count;
  }
}
