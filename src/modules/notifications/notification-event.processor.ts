import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';

import type { Job, Queue } from 'bullmq';
import { DataSource } from 'typeorm';

import { QUEUE_NAMES } from '@/infrastructure/queue/queue.constants';
import { EventDelivery } from '@/modules/event/entities/event-delivery.entity';

import { Notification } from './entities/notification.entity';
import {
  buildNotificationDrafts,
  type TDomainEventJobData,
} from './notification-draft.builder';
import type { TEmailNotificationJobData } from './notification-email.processor';
import { NotificationService } from './notification.service';

export type { TDomainEventJobData } from './notification-draft.builder';

const NOTIFICATION_CONSUMER_NAME = 'notification';

@Injectable()
@Processor(QUEUE_NAMES.DOMAIN_EVENTS)
export class NotificationEventProcessor extends WorkerHost {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
    @InjectQueue(QUEUE_NAMES.EMAIL_NOTIFICATIONS)
    private readonly emailQueue: Queue<TEmailNotificationJobData>,
  ) {
    super();
  }

  async process(job: Job<TDomainEventJobData>): Promise<Notification[]> {
    return this.handleEvent(job.data);
  }

  async handleEvent(data: TDomainEventJobData): Promise<Notification[]> {
    const { created, emailIds } = await this.dataSource.transaction(
      async (manager) => {
        const deliveryInsert = await manager
          .createQueryBuilder()
          .insert()
          .into(EventDelivery)
          .values({
            eventId: data.eventId,
            consumerName: NOTIFICATION_CONSUMER_NAME,
          })
          .orIgnore()
          .returning('id')
          .execute();

        if (!(deliveryInsert.raw as { id: string }[]).length) {
          return { created: [] as Notification[], emailIds: new Set<string>() };
        }

        const drafts = await buildNotificationDrafts(manager, data);
        if (!drafts.length) {
          return { created: [] as Notification[], emailIds: new Set<string>() };
        }

        const repo = manager.getRepository(Notification);
        const saved = await repo.save(
          drafts.map((draft) =>
            repo.create({
              recipientId: draft.recipientId,
              type: draft.type,
              title: draft.title,
              body: draft.body,
              entityType: draft.entityType,
              entityId: draft.entityId,
              isRead: false,
            }),
          ),
        );

        const emailSet = new Set<string>();
        saved.forEach((notification, index) => {
          if (drafts[index]?.sendEmail) {
            emailSet.add(notification.id);
          }
        });

        return { created: saved, emailIds: emailSet };
      },
    );

    if (created.length > 0) {
      this.notificationService.emit(created);

      const emailJobs = created
        .filter((n) => emailIds.has(n.id))
        .map((n) => ({
          name: 'send-notification-email',
          data: {
            notificationId: n.id,
            recipientId: n.recipientId,
            title: n.title,
            body: n.body,
          },
          opts: {
            jobId: `notification-email-${n.id}`,
          },
        }));

      if (emailJobs.length > 0) {
        await this.emailQueue.addBulk(emailJobs);
      }
    }

    return created;
  }
}
