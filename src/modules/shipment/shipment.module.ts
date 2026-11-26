import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GhnSandboxAdapter } from '@/infrastructure/shipping/adapters/ghn-sandbox.adapter';
import { GhnShipmentClient } from '@/infrastructure/shipping/clients/ghn-shipment.client';
import { OrderModule } from '@/modules/order/order.module';

import { Shipment } from './entities/shipment.entity';
import { ShipmentController } from './shipment.controller';
import { ShipmentService } from './shipment.service';
import { ShipmentWorker } from './shipment.worker';

@Module({
  imports: [OrderModule, TypeOrmModule.forFeature([Shipment])],
  providers: [
    GhnSandboxAdapter,
    GhnShipmentClient,
    ShipmentService,
    ShipmentWorker,
  ],
  controllers: [ShipmentController],
  exports: [ShipmentService],
})
export class ShipmentModule {}
