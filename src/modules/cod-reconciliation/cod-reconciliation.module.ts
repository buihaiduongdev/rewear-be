import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ShopLedgerEntry } from '@/modules/shop-finance/shop-ledger.entity';

import { CodReconciliationController } from './cod-reconciliation.controller';
import {
  CodCollection,
  CodRemittance,
  CodRemittanceAllocation,
} from './cod-reconciliation.entity';
import { CodReconciliationService } from './cod-reconciliation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CodCollection,
      CodRemittance,
      CodRemittanceAllocation,
      ShopLedgerEntry,
    ]),
  ],
  providers: [CodReconciliationService],
  controllers: [CodReconciliationController],
})
export class CodReconciliationModule {}
