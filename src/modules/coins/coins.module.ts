import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CoinRewardService } from './coin-reward.service';
import { CoinRewardWorker } from './coin-reward.worker';
import { CoinController } from './coin.controller';
import { CoinService } from './coin.service';
import {
  CoinAccount,
  CoinOrderDebit,
  CoinPurchaseReward,
  CoinReservation,
} from './entities';

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
