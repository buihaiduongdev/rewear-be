import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { EXCESS_POLICY } from './constants/excess.constant';
import { ExcessOperationsService } from './excess-operations.service';
import { ExcessPaymentService } from './payments/excess-payment.service';

@Injectable()
export class WalletExcessWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(WalletExcessWorker.name);
  constructor(
    private readonly operations: ExcessOperationsService,
    private readonly payments: ExcessPaymentService,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.run(), EXCESS_POLICY.WORKER_MS);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.operations.run();
      await this.payments.run();
    } catch {
      this.logger.error('Wallet recovery reconciliation remains pending');
    } finally {
      this.running = false;
    }
  }
}
