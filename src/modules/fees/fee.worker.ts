import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { FeeService } from './fee.service';

@Injectable()
export class FeeWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeeWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly fees: FeeService) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.run(), 30_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.fees.tick();
    } catch (error) {
      this.logger.error('Fee review clock failed', error);
    } finally {
      this.running = false;
    }
  }
}
