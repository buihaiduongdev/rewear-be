import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { ORDER_POLICY } from './constants/order.constant';
import { OrderService } from './order.service';

@Injectable()
export class OrderWorker {
  private readonly logger = new Logger(OrderWorker.name);
  private running = false;

  constructor(private readonly orderService: OrderService) {}

  @Interval(ORDER_POLICY.WORKER_INTERVAL_MS)
  async run() {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.orderService.expireDue();
    } catch {
      this.logger.error('Order expiry scan failed; retry required');
      return 0;
    } finally {
      this.running = false;
    }
  }
}
