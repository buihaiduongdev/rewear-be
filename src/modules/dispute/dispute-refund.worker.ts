import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { REFUND_EXECUTION_POLICY } from './constants/refund-execution.constant';
import { DisputeRefundService } from './dispute-refund.service';

@Injectable()
export class DisputeRefundWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(DisputeRefundWorker.name);
  constructor(private readonly refunds: DisputeRefundService) {}
  onModuleInit() {
    // Tests invoke the same scan explicitly to avoid racing database fixtures.
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.refunds
        .run()
        .catch(() => this.logger.error('Refund scan failed; retry required'))
        .finally(() => {
          this.running = false;
        });
    }, REFUND_EXECUTION_POLICY.WORKER_INTERVAL_MS);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
