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
import { ShopPayoutService } from './payouts/shop-payout.service';
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
  providers: [ShopFinanceService, ShopPayoutService],
  controllers: [ShopFinanceController],
  exports: [ShopFinanceService, ShopPayoutService],
})
export class ShopFinanceModule {}
