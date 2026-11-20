import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WalletCheckoutModule } from './checkout/wallet-checkout.module';
import { WalletAccount, WalletCredit } from './entities/wallet.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    WalletCheckoutModule,
    TypeOrmModule.forFeature([WalletAccount, WalletCredit]),
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
