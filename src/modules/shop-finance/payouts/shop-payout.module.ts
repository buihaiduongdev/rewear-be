import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ShopBankAccount } from './entities/shop-bank-account.entity';
import {
  ShopPayout,
  ShopPayoutAllocation,
  ShopPayoutEvent,
  ShopPayoutRisk,
} from './entities/shop-payout.entity';
import {
  AdminShopPayoutController,
  ShopPayoutController,
} from './shop-payout.controller';
import { ShopPayoutService } from './shop-payout.service';
import { ShopPayoutWorker } from './shop-payout.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ShopBankAccount,
      ShopPayout,
      ShopPayoutAllocation,
      ShopPayoutEvent,
      ShopPayoutRisk,
    ]),
  ],
  controllers: [ShopPayoutController, AdminShopPayoutController],
  providers: [ShopPayoutService, ShopPayoutWorker],
  exports: [ShopPayoutService],
})
export class ShopPayoutModule {}
