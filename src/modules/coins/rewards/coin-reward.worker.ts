import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { ORDER_POLICY } from '@/modules/order/constants/order.constant';

import { CoinRewardService } from './coin-reward.service';

@Injectable()
export class CoinRewardWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CoinRewardWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly rewards: CoinRewardService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.rewards
        .evaluateDue()
        .catch(() =>
          this.logger.error('Purchase rewards scan failed; retry required'),
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
