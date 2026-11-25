import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CoinsModule } from '../coins.module';
import { CoinPurchaseReward } from '../core/entities';
import { CoinRewardService } from './coin-reward.service';
import { CoinRewardWorker } from './coin-reward.worker';

@Module({
  imports: [CoinsModule, TypeOrmModule.forFeature([CoinPurchaseReward])],
  providers: [CoinRewardService, CoinRewardWorker],
  exports: [CoinRewardService],
})
export class CoinRewardModule {}
