import { Module } from '@nestjs/common';

import { GhnShopClient } from '@/infrastructure/shipping/clients/ghn-shop.client';

import { AdministrativeDivisionController } from './administrative-division.controller';
import { AdministrativeDivisionService } from './administrative-division.service';

@Module({
  controllers: [AdministrativeDivisionController],
  providers: [AdministrativeDivisionService, GhnShopClient],
  exports: [AdministrativeDivisionService],
})
export class AdministrativeDivisionModule {}
