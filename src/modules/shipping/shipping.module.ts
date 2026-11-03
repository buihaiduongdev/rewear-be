import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdministrativeDivisionModule } from '@/modules/administrative-division';
import { ProductModule } from '@/modules/product';

import { PickupLocation } from './entities/pickup-location.entity';
import { PickupLocationController } from './pickup-location.controller';
import { PickupLocationService } from './pickup-location.service';
import { ShippingController } from './shipping.controller';

@Module({
  imports: [
    ProductModule,
    AdministrativeDivisionModule,
    TypeOrmModule.forFeature([PickupLocation]),
  ],
  controllers: [ShippingController, PickupLocationController],
  providers: [PickupLocationService],
})
export class ShippingModule {}
