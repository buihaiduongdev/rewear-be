import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { NOTIFICATION_POLICY } from './constants/notification.constant';
import { NotificationEmailService } from './notification-email.service';
import { NotificationProjector } from './notification-projector.service';

@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    private readonly projector: NotificationProjector,
    private readonly emails: NotificationEmailService,
  ) {}
  async onModuleInit() {
    await this.projector.initialize();
    // HTTP tests drive the projector/sender explicitly with a fake SMTP sender.
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      void this.tick();
    }, NOTIFICATION_POLICY.WORKER_INTERVAL_MS);
    this.timer.unref();
  }
  async tick() {
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
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
