import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { FEE_PAYMENT_POLICY } from './constants/fee-payment.constant';
import { FeePaymentService } from './fee-payment.service';

@Injectable()
export class FeePaymentWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(FeePaymentWorker.name);
  constructor(private readonly payments: FeePaymentService) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.payments
        .run()
        .catch(() =>
          this.logger.error('Fee payment reconciliation remains pending'),
        )
        .finally(() => {
          this.running = false;
        });
    }, FEE_PAYMENT_POLICY.WORKER_INTERVAL_MS);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
