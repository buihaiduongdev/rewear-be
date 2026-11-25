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
  providers: [CoinService],
  exports: [CoinService],
})
export class CoinsModule {}
