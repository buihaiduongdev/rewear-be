import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentModule } from '@/modules/payment/payment.module';

import {
  WalletCheckoutHold,
  WalletDebit,
} from './entities/wallet-checkout.entity';
import { WalletCheckoutController } from './wallet-checkout.controller';
import { WalletCheckoutService } from './wallet-checkout.service';

@Module({
  imports: [
    PaymentModule,
    TypeOrmModule.forFeature([WalletCheckoutHold, WalletDebit]),
  ],
  controllers: [WalletCheckoutController],
  providers: [WalletCheckoutService],
})
export class WalletCheckoutModule {}
