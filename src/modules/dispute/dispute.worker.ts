import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { DisputeAdjudicationService } from './dispute-adjudication.service';
import { DisputeRefundService } from './dispute-refund.service';

@Injectable()
export class DisputeWorker {
  private readonly logger = new Logger(DisputeWorker.name);
  private running = false;

  constructor(
    private readonly adjudication: DisputeAdjudicationService,
    private readonly refunds: DisputeRefundService,
  ) {}

  @Interval(60_000)
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.adjudication.run();
      await this.refunds.run();
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : 'Dispute scan failed',
      );
    } finally {
      this.running = false;
    }
  }
}
