import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GhnSandboxAdapter } from '@/infrastructure/shipping/ghn-sandbox.adapter';
import { GhnShipmentClient } from '@/infrastructure/shipping/ghn-shipment.client';
import { OrderModule } from '@/modules/order/order.module';

import { ShipmentCancellationService } from './shipment-cancellation.service';
import { ShipmentController } from './shipment.controller';
import { Shipment } from './shipment.entity';
import { ShipmentService } from './shipment.service';
import { ShipmentWorker } from './shipment.worker';

@Module({
  imports: [OrderModule, TypeOrmModule.forFeature([Shipment])],
  providers: [
    GhnSandboxAdapter,
    GhnShipmentClient,
    ShipmentService,
    ShipmentCancellationService,
    ShipmentWorker,
  ],
  controllers: [ShipmentController],
})
export class ShipmentModule {}
