import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { ORDER_POLICY } from './constants/order.constant';
import { OrderSettlementService } from './order-settlement.service';

@Injectable()
export class OrderSettlementWorker {
  private readonly logger = new Logger(OrderSettlementWorker.name);
  private running = false;

  constructor(private readonly settlement: OrderSettlementService) {}

  @Interval(ORDER_POLICY.WORKER_INTERVAL_MS)
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.settlement.settleDue();
    } catch {
      this.logger.error('Order settlement scan failed; retry required');
    } finally {
      this.running = false;
    }
  }
}
