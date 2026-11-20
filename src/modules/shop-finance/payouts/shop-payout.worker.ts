import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { PAYOUT_POLICY } from './constants/payout.constant';
import { ShopPayoutService } from './shop-payout.service';

@Injectable()
export class ShopPayoutWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(ShopPayoutWorker.name);
  constructor(private readonly service: ShopPayoutService) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.service
        .run()
        .catch(() =>
          this.logger.error('Payout deadline reconciliation required'),
        )
        .finally(() => {
          this.running = false;
        });
    }, PAYOUT_POLICY.WORKER_INTERVAL_MS);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
