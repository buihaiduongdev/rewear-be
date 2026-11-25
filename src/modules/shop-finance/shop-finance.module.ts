import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CodCollection } from '@/modules/cod-reconciliation/entities';
import { OrderModule } from '@/modules/order/order.module';

import { ShopLedgerEntry } from './entities/shop-ledger.entity';
import { ShopSettlement } from './entities/shop-settlement.entity';
import {
  ShopBankAccount,
  ShopPayout,
  ShopPayoutAllocation,
} from './payouts/entities';
import {
  AdminShopPayoutController,
  ShopPayoutController,
} from './payouts/shop-payout.controller';
import { ShopPayoutService } from './payouts/shop-payout.service';
import { ShopPayoutWorker } from './payouts/shop-payout.worker';
import { ShopFinanceController } from './shop-finance.controller';
import { ShopFinanceService } from './shop-finance.service';

@Module({
  imports: [
    OrderModule,
    TypeOrmModule.forFeature([
      CodCollection,
      ShopLedgerEntry,
      ShopSettlement,
      ShopBankAccount,
      ShopPayout,
      ShopPayoutAllocation,
    ]),
  ],
  providers: [ShopFinanceService, ShopPayoutService, ShopPayoutWorker],
  controllers: [
    ShopFinanceController,
    ShopPayoutController,
    AdminShopPayoutController,
  ],
  exports: [ShopFinanceService, ShopPayoutService],
})
export class ShopFinanceModule {}
