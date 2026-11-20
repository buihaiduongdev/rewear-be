import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FeeModule } from '../fee.module';
import {
  FeeOffsetAllocation,
  FeeSettlementIncident,
  FeeWalletDebit,
} from './entities/fee-settlement.entity';
import { FeeSettlementController } from './fee-settlement.controller';
import { FeeSettlementService } from './fee-settlement.service';
import { FeeSettlementWorker } from './fee-settlement.worker';
import { FeeWalletService } from './fee-wallet.service';

@Module({
  imports: [
    FeeModule,
    TypeOrmModule.forFeature([
      FeeWalletDebit,
      FeeOffsetAllocation,
      FeeSettlementIncident,
    ]),
  ],
  providers: [FeeWalletService, FeeSettlementService, FeeSettlementWorker],
  controllers: [FeeSettlementController],
})
export class FeeSettlementModule {}
