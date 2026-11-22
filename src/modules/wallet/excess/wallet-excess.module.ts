import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MomoSandboxClient } from '@/infrastructure/payment/momo-sandbox.client';
import { readMomoSettings } from '@/modules/payment/payment.config';

import { EXCESS_MOMO_CLIENT } from './constants/excess.constant';
import {
  ExcessAudit,
  ExcessCapture,
  ExcessCollection,
  ExcessCommand,
  ExcessOffsetSource,
  ExcessPayment,
  ExcessProviderRefund,
  ExcessReturn,
  WalletExcess,
} from './entities/excess.entity';
import { ExcessOperationsService } from './excess-operations.service';
import { ExcessAttemptService } from './payments/excess-attempt.service';
import { ExcessPaymentService } from './payments/excess-payment.service';
import { ExcessRefundService } from './payments/excess-refund.service';
import { WalletExcessController } from './wallet-excess.controller';
import { WalletExcessService } from './wallet-excess.service';
import { WalletExcessWorker } from './wallet-excess.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WalletExcess,
      ExcessAudit,
      ExcessCapture,
      ExcessCollection,
      ExcessCommand,
      ExcessOffsetSource,
      ExcessPayment,
      ExcessProviderRefund,
      ExcessReturn,
    ]),
  ],
  providers: [
    WalletExcessService,
    ExcessOperationsService,
    ExcessPaymentService,
    ExcessAttemptService,
    ExcessRefundService,
    WalletExcessWorker,
    {
      provide: EXCESS_MOMO_CLIENT,
      useFactory: () => {
        const settings = readMomoSettings();
        return settings ? new MomoSandboxClient(settings) : null;
      },
    },
  ],
  controllers: [WalletExcessController],
  exports: [ExcessPaymentService],
})
export class WalletExcessModule {}
