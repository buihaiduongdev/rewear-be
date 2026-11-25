import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PayosModule } from '@/infrastructure/payment/payos.module';

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
} from './entities';
import { ExcessOperationsService } from './excess-operations.service';
import { ExcessAttemptService } from './payments/excess-attempt.service';
import { ExcessPaymentService } from './payments/excess-payment.service';
import { ExcessRefundService } from './payments/excess-refund.service';
import { WalletExcessController } from './wallet-excess.controller';
import { WalletExcessService } from './wallet-excess.service';
import { WalletExcessWorker } from './wallet-excess.worker';

@Module({
  imports: [
    PayosModule,
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
  ],
  controllers: [WalletExcessController],
  exports: [ExcessPaymentService],
})
export class WalletExcessModule {}
