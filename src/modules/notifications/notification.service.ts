import {
  Injectable,
  type MessageEvent,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { paginate, type PaginateQuery } from 'nestjs-paginate';
import { filter, map, type Observable, Subject } from 'rxjs';
import { Repository } from 'typeorm';

import { NOTIFICATION_PAGINATION_CONFIG } from './constants/notification-pagination.config';
import { Notification } from './entities/notification.entity';
import { notificationResponseSchema } from './schemas/notification.schema';

@Injectable()
export class NotificationService implements OnModuleDestroy {
  private readonly streamSubject = new Subject<Notification>();

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  onModuleDestroy(): void {
    this.streamSubject.complete();
  }

  emit(notifications: Notification[]): void {
    for (const notification of notifications) {
      this.streamSubject.next(notification);
    }
  }

  subscribe(recipientId: string): Observable<MessageEvent> {
    return this.streamSubject.asObservable().pipe(
      filter((notification) => notification.recipientId === recipientId),
      map((notification) => ({
        id: notification.id,
        type: notification.type,
        data: notificationResponseSchema.parse(notification),
      })),
    );
  }

  findAll(recipientId: string, query: PaginateQuery) {
    const qb = this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.recipientId = :recipientId', { recipientId });

    return paginate(query, qb, NOTIFICATION_PAGINATION_CONFIG);
  }

  async getUnreadCount(recipientId: string) {
    const count = await this.notificationRepository.count({
      where: {
        recipientId,
        isRead: false,
      },
    });
    return { count };
  }

  async markAsRead(recipientId: string, id: string) {
    const notification = await this.notificationRepository.findOneBy({
      id,
      recipientId,
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.isRead) {
      return notification;
    }

    notification.isRead = true;
    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(recipientId: string) {
    const result = await this.notificationRepository.update(
      {
        recipientId,
        isRead: false,
      },
      {
        isRead: true,
      },
    );

    return { updatedCount: result.affected ?? 0 };
  }
}
