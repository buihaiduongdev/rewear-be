import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CoinCodReleaseService } from './core/coin-cod-release.service';
import { CoinService } from './core/coin.service';
import { CoinCodReleaseAudit } from './core/entities/coin-cod-release.entity';
import {
  CoinGrant,
  CoinMovement,
  CoinOrderDebit,
  CoinRecovery,
  CoinReservation,
  CoinSelection,
} from './core/entities/coin.entity';
import { CoinProgramApiService } from './programs/coin-program-api.service';
import { CoinProgramController } from './programs/coin-program.controller';
import { CoinProgramService } from './programs/coin-program.service';
import {
  CoinProgram,
  CoinProgramAudit,
  CoinProgramBatch,
  CoinProgramMistake,
} from './programs/entities/coin-program.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoinCodReleaseAudit,
      CoinGrant,
      CoinMovement,
      CoinOrderDebit,
      CoinRecovery,
      CoinReservation,
      CoinSelection,
      CoinProgram,
      CoinProgramAudit,
      CoinProgramBatch,
      CoinProgramMistake,
    ]),
  ],
  controllers: [CoinProgramController],
  providers: [
    CoinCodReleaseService,
    CoinService,
    CoinProgramService,
    CoinProgramApiService,
  ],
  exports: [CoinService, CoinProgramService],
})
export class CoinsModule {}
