import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WalletCheckoutModule } from './checkout/wallet-checkout.module';
import { WalletAccount, WalletCredit } from './entities/wallet.entity';
import { WalletExcessModule } from './excess/wallet-excess.module';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    WalletExcessModule,
    WalletCheckoutModule,
    TypeOrmModule.forFeature([WalletAccount, WalletCredit]),
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
