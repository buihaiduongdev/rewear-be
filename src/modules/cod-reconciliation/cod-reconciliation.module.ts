import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';

import { CodReconciliationController } from './cod-reconciliation.controller';
import { CodReconciliationService } from './cod-reconciliation.service';
import {
  CodCollection,
  CodRemittance,
  CodRemittanceAllocation,
} from './entities';

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
