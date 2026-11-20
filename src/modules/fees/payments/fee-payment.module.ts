import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MomoSandboxClient } from '@/infrastructure/payment/momo-sandbox.client';
import { readMomoSettings } from '@/modules/payment/payment.config';

import {
  FeeAssessment,
  FeeCollection,
  FeeRefund,
} from '../entities/fee.entity';
import { FEE_MOMO_CLIENT } from './constants/fee-payment.constant';
import {
  FeePayment,
  FeePaymentCapture,
  FeeProviderRefund,
} from './entities/fee-payment.entity';
import { FeePaymentController } from './fee-payment.controller';
import { FeePaymentService } from './fee-payment.service';
import { FeePaymentWorker } from './fee-payment.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FeePayment,
      FeePaymentCapture,
      FeeProviderRefund,
      FeeAssessment,
      FeeCollection,
      FeeRefund,
    ]),
  ],
  controllers: [FeePaymentController],
  providers: [
    FeePaymentService,
    FeePaymentWorker,
    {
      provide: FEE_MOMO_CLIENT,
      useFactory: () => {
        const settings = readMomoSettings();
        return settings ? new MomoSandboxClient(settings) : null;
      },
    },
  ],
  exports: [FeePaymentService],
})
export class FeePaymentModule {}
