import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PayosModule } from '@/infrastructure/payment/payos.module';
import { CheckoutModule } from '@/modules/checkout/checkout.module';
import { Order } from '@/modules/order/entities';

import { PaymentAttempt, PaymentRefund } from './entities';
import { PaymentController } from './payment.controller';
import { PaymentPricing } from './payment.pricing';
import { PaymentService } from './payment.service';
import { PaymentWorker } from './payment.worker';

@Module({
  imports: [
    PayosModule,
    CheckoutModule,
    TypeOrmModule.forFeature([PaymentAttempt, PaymentRefund, Order]),
  ],
  controllers: [PaymentController],
  providers: [PaymentPricing, PaymentService, PaymentWorker],
  exports: [PaymentService, PaymentPricing],
})
export class PaymentModule {}
