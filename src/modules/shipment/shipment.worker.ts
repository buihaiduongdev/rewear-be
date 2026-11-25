import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { FULFILLMENT_POLICY } from './constants/shipment.constant';
import { ShipmentService } from './shipment.service';

@Injectable()
export class ShipmentWorker {
  private readonly logger = new Logger(ShipmentWorker.name);
  private running = false;

  constructor(private readonly shipmentService: ShipmentService) {}

  @Interval(FULFILLMENT_POLICY.QUERY_INTERVAL_MS)
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.shipmentService.run();
    } catch {
      this.logger.error('Shipment reconciliation scan failed; retry required');
    } finally {
      this.running = false;
    }
  }
}
