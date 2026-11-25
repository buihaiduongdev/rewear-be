import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { NOTIFICATION_POLICY } from './constants/notification.constant';
import { NotificationEmailService } from './notification-email.service';
import { NotificationProjector } from './notification-projector.service';

@Injectable()
export class NotificationWorker implements OnModuleInit {
  private readonly logger = new Logger(NotificationWorker.name);
  private running = false;

  constructor(
    private readonly projector: NotificationProjector,
    private readonly emails: NotificationEmailService,
  ) {}

  async onModuleInit() {
    await this.projector.initialize();
  }

  @Interval(NOTIFICATION_POLICY.WORKER_INTERVAL_MS)
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.projector.run();
      await this.emails.run();
    } catch {
      this.logger.error('Notification processing failed; retry required');
    } finally {
      this.running = false;
    }
  }
}
