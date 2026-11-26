import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';

import { QUEUE_NAMES } from '@/infrastructure/queue/queue.constants';

import { OUTBOX_EVENT_STATUSES } from './constants/event-status.constant';
import { OutboxEvent } from './entities/outbox-event.entity';

const OUTBOX_PUBLISH_BATCH_SIZE = 50;

@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private isPublishing = false;

  constructor(
    private readonly dataSource: DataSource,
    @InjectQueue(QUEUE_NAMES.DOMAIN_EVENTS)
    private readonly domainEventsQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async handleCron(): Promise<void> {
    if (this.isPublishing) return;
    this.isPublishing = true;
    try {
      const publishedCount = await this.publishPendingEvents();
      if (publishedCount > 0) {
        this.logger.debug(`Enqueued ${publishedCount} outbox event(s)`);
      }
    } catch (error) {
      this.logger.error(
        'Failed to publish pending outbox events',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isPublishing = false;
    }
  }

  async publishPendingEvents(
    batchSize = OUTBOX_PUBLISH_BATCH_SIZE,
  ): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const pendingEvents = await manager
        .getRepository(OutboxEvent)
        .createQueryBuilder('event')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('event.status = :status', {
          status: OUTBOX_EVENT_STATUSES.PENDING,
        })
        .orderBy('event.createdAt', 'ASC')
        .limit(batchSize)
        .getMany();

      if (!pendingEvents.length) return 0;

      await this.domainEventsQueue.addBulk(
        pendingEvents.map((event) => ({
          name: event.eventType,
          data: {
            eventId: event.id,
            eventType: event.eventType,
            resourceId: event.resourceId,
            payload: event.payload,
          },
          opts: {
            jobId: event.id,
          },
        })),
      );

      await manager
        .createQueryBuilder()
        .update(OutboxEvent)
        .set({ status: OUTBOX_EVENT_STATUSES.ENQUEUED })
        .whereInIds(pendingEvents.map((event) => event.id))
        .execute();

      return pendingEvents.length;
    });
  }
}
