import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { QUEUE_NAMES } from '@/infrastructure/queue/queue.constants';
import { EventDelivery } from '@/modules/event/entities/event-delivery.entity';
import { EventModule } from '@/modules/event/event.module';
import { MailModule } from '@/modules/mail/mail.module';

import { Notification } from './entities/notification.entity';
import { NotificationEmailProcessor } from './notification-email.processor';
import { NotificationEventProcessor } from './notification-event.processor';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    EventModule,
    MailModule,
    TypeOrmModule.forFeature([Notification, EventDelivery]),
    BullModule.registerQueue({ name: QUEUE_NAMES.EMAIL_NOTIFICATIONS }),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationEventProcessor,
    NotificationEmailProcessor,
  ],
  exports: [
    NotificationService,
    NotificationEventProcessor,
    NotificationEmailProcessor,
    TypeOrmModule,
  ],
})
export class NotificationModule {}
