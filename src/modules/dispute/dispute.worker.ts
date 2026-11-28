import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { DisputeAdjudicationService } from './dispute-adjudication.service';
import { DisputeRefundService } from './dispute-refund.service';

@Injectable()
export class DisputeWorker {
  private readonly logger = new Logger(DisputeWorker.name);
  private running = false;

  constructor(
    private readonly disputeAdjudicationService: DisputeAdjudicationService,
    private readonly disputeRefundService: DisputeRefundService,
  ) {}

  @Interval(60_000)
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.disputeAdjudicationService.run();
      await this.disputeRefundService.run();
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : 'Dispute scan failed',
      );
    } finally {
      this.running = false;
    }
  }
}
