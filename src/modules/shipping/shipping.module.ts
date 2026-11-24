import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GhnShopClient } from '@/infrastructure/shipping/clients/ghn-shop.client';
import { AdministrativeDivisionModule } from '@/modules/administrative-division';
import { AuthorizationModule } from '@/modules/authorization/authorization.module';
import { ProductModule } from '@/modules/product';

import { PickupLocation } from './entities/pickup-location.entity';
import { GhnConnectionAdminController } from './ghn-connection-admin.controller';
import { PickupLocationController } from './pickup-location.controller';
import { PickupLocationService } from './pickup-location.service';
import { ShippingController } from './shipping.controller';

@Module({
  imports: [
    AuthorizationModule,
    ProductModule,
    AdministrativeDivisionModule,
    TypeOrmModule.forFeature([PickupLocation]),
  ],
  controllers: [
    ShippingController,
    PickupLocationController,
    GhnConnectionAdminController,
  ],
  providers: [PickupLocationService, GhnShopClient],
})
export class ShippingModule {}
