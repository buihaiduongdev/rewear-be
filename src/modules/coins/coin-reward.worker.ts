import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { CoinRewardService } from './coin-reward.service';

@Injectable()
export class CoinRewardWorker {
  private readonly logger = new Logger(CoinRewardWorker.name);
  private running = false;

  constructor(private readonly coinRewardService: CoinRewardService) {}

  @Interval(60_000)
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.coinRewardService.evaluateDue();
    } catch {
      this.logger.error('Purchase rewards scan failed; retry required');
    } finally {
      this.running = false;
    }
  }
}
