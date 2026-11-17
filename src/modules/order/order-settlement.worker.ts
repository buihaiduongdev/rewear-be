import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { ORDER_POLICY } from './constants/order.constant';
import { OrderSettlementService } from './order-settlement.service';

@Injectable()
export class OrderSettlementWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderSettlementWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly settlement: OrderSettlementService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.settlement
        .settleDue()
        .catch(() =>
          this.logger.error('Settlement scan failed; retry required'),
        )
        .finally(() => {
          this.running = false;
        });
    }, ORDER_POLICY.WORKER_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
