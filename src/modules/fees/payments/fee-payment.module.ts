import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PayosModule } from '@/infrastructure/payment/payos.module';

import { FeeAssessment, FeeCollection, FeeRefund } from '../entities';
import { FeePayment, FeePaymentCapture, FeeProviderRefund } from './entities';
import { FeePaymentController } from './fee-payment.controller';
import { FeePaymentService } from './fee-payment.service';
import { FeePaymentWorker } from './fee-payment.worker';

@Module({
  imports: [
    PayosModule,
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
  providers: [FeePaymentService, FeePaymentWorker],
  exports: [FeePaymentService],
})
export class FeePaymentModule {}
