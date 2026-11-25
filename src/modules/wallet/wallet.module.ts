import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentModule } from '@/modules/payment/payment.module';

import { WalletCheckoutHold, WalletDebit } from './checkout/entities';
import { WalletCheckoutService } from './checkout/wallet-checkout.service';
import { WalletAccount, WalletCredit } from './entities';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    PaymentModule,
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
