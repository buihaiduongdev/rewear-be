import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthorizationModule } from '@/modules/authorization/authorization.module';
import { MailModule } from '@/modules/mail/mail.module';

import {
  Notification,
  NotificationCheckpoint,
  NotificationEmailJob,
  NotificationEvent,
} from './entities';
import { NotificationEmailService } from './notification-email.service';
import { NotificationProjector } from './notification-projector.service';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationWorker } from './notification.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationCheckpoint,
      NotificationEmailJob,
      NotificationEvent,
    ]),
    AuthorizationModule,
    MailModule,
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationEmailService,
    NotificationProjector,
    NotificationWorker,
  ],
  exports: [NotificationService, NotificationProjector],
})
export class NotificationModule {}
