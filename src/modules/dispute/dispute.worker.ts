import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { DISPUTE_POLICY } from './constants/dispute.constant';
import { DisputeReviewService } from './dispute-review.service';

@Injectable()
export class DisputeWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DisputeWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly review: DisputeReviewService) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.review
        .run()
        .catch(() => this.logger.error('Dispute scan failed; retry required'))
        .finally(() => {
          this.running = false;
        });
    }, DISPUTE_POLICY.WORKER_INTERVAL_MS);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
