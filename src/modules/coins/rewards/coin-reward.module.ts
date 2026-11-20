import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CoinsModule } from '../coins.module';
import { CoinRewardController } from './coin-reward.controller';
import { CoinRewardService } from './coin-reward.service';
import { CoinRewardWorker } from './coin-reward.worker';
import {
  CoinPurchaseReward,
  CoinRewardAdjustmentNotice,
} from './entities/coin-reward.entity';

@Module({
  imports: [
    CoinsModule,
    TypeOrmModule.forFeature([CoinPurchaseReward, CoinRewardAdjustmentNotice]),
  ],
  controllers: [CoinRewardController],
  providers: [CoinRewardService, CoinRewardWorker],
  exports: [CoinRewardService],
})
export class CoinRewardModule {}
