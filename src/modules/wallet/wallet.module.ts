import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentModule } from '@/modules/payment/payment.module';

import {
  WalletAccount,
  WalletCheckoutHold,
  WalletCredit,
  WalletDebit,
} from './entities';
import { WalletCheckoutService } from './wallet-checkout.service';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    forwardRef(() => PaymentModule),
    TypeOrmModule.forFeature([
      WalletAccount,
      WalletCredit,
      WalletCheckoutHold,
      WalletDebit,
    ]),
  ],
  controllers: [WalletController],
  providers: [WalletService, WalletCheckoutService],
  exports: [WalletService, WalletCheckoutService],
})
export class WalletModule {}
