import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { ORDER_POLICY } from './constants/order.constant';
import { OrderService } from './order.service';

@Injectable()
export class OrderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly orders: OrderService) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.orders
        .expireDue()
        .catch(() =>
          this.logger.error(
            'Order expiry failed; transaction rolled back and pending orders will be retried',
          ),
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
