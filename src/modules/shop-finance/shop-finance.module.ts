import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CodCollection } from '@/modules/cod-reconciliation/entities/cod-reconciliation.entity';
import { OrderModule } from '@/modules/order/order.module';

import { ShopLedgerEntry } from './entities/shop-ledger.entity';
import { ShopPayoutModule } from './payouts/shop-payout.module';
import { ShopFinanceController } from './shop-finance.controller';
import { ShopFinanceService } from './shop-finance.service';

@Module({
  imports: [
    ShopPayoutModule,
    OrderModule,
    TypeOrmModule.forFeature([CodCollection, ShopLedgerEntry]),
  ],
  providers: [ShopFinanceService],
  controllers: [ShopFinanceController],
})
export class ShopFinanceModule {}
