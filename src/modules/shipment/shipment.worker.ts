import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { CarrierIncidentService } from './carrier-incident.service';
import { FULFILLMENT_POLICY } from './constants/fulfillment.constant';
import { LateHandoverService } from './late-handover.service';
import { ReturnInspectionDeadlineService } from './return-inspection-deadline.service';
import { ShipmentCancellationService } from './shipment-cancellation.service';
import { ShipmentService } from './shipment.service';

@Injectable()
export class ShipmentWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(ShipmentWorker.name);
  constructor(
    private readonly shipmentService: ShipmentService,
    private readonly shipmentCancellationService: ShipmentCancellationService,
    private readonly lateHandoverService: LateHandoverService,
    private readonly carrierIncidentService: CarrierIncidentService,
    private readonly returnInspectionDeadlineService: ReturnInspectionDeadlineService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.run()
        .catch(() =>
          this.logger.error('Shipment workflow requires reconciliation'),
        )
        .finally(() => {
          this.running = false;
        });
    }, FULFILLMENT_POLICY.WORKER_INTERVAL_MS);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async run() {
    const results = await Promise.allSettled([
      this.shipmentCancellationService.run(),
      this.shipmentService.run(),
      this.lateHandoverService.run(),
      this.carrierIncidentService.run(),
      this.returnInspectionDeadlineService.run(),
    ]);
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('Fulfillment worker requires reconciliation');
  }
}
