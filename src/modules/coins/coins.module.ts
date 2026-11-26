import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CoinController } from './coin.controller';
import { CoinService } from './core/coin.service';
import {
  CoinAccount,
  CoinOrderDebit,
  CoinPurchaseReward,
  CoinReservation,
} from './core/entities';
import { CoinRewardService } from './rewards/coin-reward.service';
import { CoinRewardWorker } from './rewards/coin-reward.worker';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoinAccount,
      CoinOrderDebit,
      CoinPurchaseReward,
      CoinReservation,
    ]),
  ],
  controllers: [CoinController],
  providers: [CoinService, CoinRewardService, CoinRewardWorker],
  exports: [CoinService, CoinRewardService],
})
export class CoinsModule {}
