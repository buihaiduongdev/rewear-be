import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CodCollection } from '@/modules/cod-reconciliation/entities';
import { OrderModule } from '@/modules/order/order.module';

import {
  ShopBankAccount,
  ShopLedgerEntry,
  ShopPayout,
  ShopPayoutAllocation,
  ShopSettlement,
} from './entities';
import { ShopFinanceController } from './shop-finance.controller';
import { ShopFinanceService } from './shop-finance.service';
import { ShopPayoutService } from './shop-payout.service';

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
  providers: [ShopFinanceService, ShopPayoutService],
  controllers: [ShopFinanceController],
  exports: [ShopFinanceService, ShopPayoutService],
})
export class ShopFinanceModule {}
