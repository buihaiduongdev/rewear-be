import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CodCollection } from '@/modules/cod-reconciliation/cod-reconciliation.entity';
import { OrderModule } from '@/modules/order/order.module';

import { ShopFinanceController } from './shop-finance.controller';
import { ShopFinanceService } from './shop-finance.service';
import { ShopLedgerEntry } from './shop-ledger.entity';

@Module({
  imports: [
    OrderModule,
    TypeOrmModule.forFeature([CodCollection, ShopLedgerEntry]),
  ],
  providers: [ShopFinanceService],
  controllers: [ShopFinanceController],
})
export class ShopFinanceModule {}
