import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GhnSandboxAdapter } from '@/infrastructure/shipping/ghn-sandbox.adapter';
import { GhnShipmentClient } from '@/infrastructure/shipping/ghn-shipment.client';
import { OrderModule } from '@/modules/order/order.module';

import { CarrierIncidentController } from './carrier-incident.controller';
import { CarrierIncident } from './carrier-incident.entity';
import { CarrierIncidentService } from './carrier-incident.service';
import { LateHandoverController } from './late-handover.controller';
import {
  FulfillmentCalendar,
  FulfillmentNotice,
  HandoverCase,
} from './late-handover.entity';
import { LateHandoverService } from './late-handover.service';
import { ReturnInspectionDeadlineService } from './return-inspection-deadline.service';
import { ShipmentCancellationService } from './shipment-cancellation.service';
import { ShipmentReturnInspection } from './shipment-return-inspection.entity';
import { ShipmentReturnInspectionService } from './shipment-return-inspection.service';
import { ShipmentController } from './shipment.controller';
import { Shipment } from './shipment.entity';
import { ShipmentService } from './shipment.service';
import { ShipmentWorker } from './shipment.worker';

@Module({
  imports: [
    OrderModule,
    TypeOrmModule.forFeature([
      Shipment,
      FulfillmentCalendar,
      FulfillmentNotice,
      HandoverCase,
      ShipmentReturnInspection,
      CarrierIncident,
    ]),
  ],
  providers: [
    GhnSandboxAdapter,
    GhnShipmentClient,
    ShipmentService,
    ShipmentCancellationService,
    ShipmentWorker,
    LateHandoverService,
    ShipmentReturnInspectionService,
    CarrierIncidentService,
    ReturnInspectionDeadlineService,
  ],
  controllers: [
    ShipmentController,
    LateHandoverController,
    CarrierIncidentController,
  ],
})
export class ShipmentModule {}
