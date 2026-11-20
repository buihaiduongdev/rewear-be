import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { FEE_SETTLEMENT_POLICY } from './constants/fee-settlement.constant';
import { FeeSettlementService } from './fee-settlement.service';

@Injectable()
export class FeeSettlementWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(FeeSettlementWorker.name);
  constructor(private readonly service: FeeSettlementService) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.service
        .run()
        .catch(() =>
          this.logger.error('Fee settlement requires reconciliation'),
        )
        .finally(() => {
          this.running = false;
        });
    }, FEE_SETTLEMENT_POLICY.WORKER_INTERVAL_MS);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
