import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GhnSandboxAdapter } from '@/infrastructure/shipping/adapters/ghn-sandbox.adapter';
import { GhnShipmentClient } from '@/infrastructure/shipping/clients/ghn-shipment.client';
import { OrderModule } from '@/modules/order/order.module';

import { CarrierIncidentController } from './carrier-incident.controller';
import { CarrierIncidentService } from './carrier-incident.service';
import { CarrierIncident } from './entities/carrier-incident.entity';
import {
  FulfillmentCalendar,
  FulfillmentNotice,
  HandoverCase,
} from './entities/late-handover.entity';
import { ShipmentReturnInspection } from './entities/shipment-return-inspection.entity';
import { Shipment } from './entities/shipment.entity';
import { LateHandoverController } from './late-handover.controller';
import { LateHandoverService } from './late-handover.service';
import { ReturnInspectionDeadlineService } from './return-inspection-deadline.service';
import { ShipmentCancellationService } from './shipment-cancellation.service';
import { ShipmentReturnInspectionService } from './shipment-return-inspection.service';
import { ShipmentController } from './shipment.controller';
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
