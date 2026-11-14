import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MomoSandboxClient } from '@/infrastructure/payment/momo-sandbox.client';
import { CheckoutModule } from '@/modules/checkout/checkout.module';
import { Order } from '@/modules/order/order.entity';

import { MOMO_CLIENT, readMomoSettings } from './payment.config';
import { PaymentController } from './payment.controller';
import { PaymentAttempt, PaymentRefund } from './payment.entity';
import { PaymentPricing } from './payment.pricing';
import { PaymentService } from './payment.service';
import { PaymentWorker } from './payment.worker';

@Module({
  imports: [
    CheckoutModule,
    TypeOrmModule.forFeature([PaymentAttempt, PaymentRefund, Order]),
  ],
  controllers: [PaymentController],
  providers: [
    PaymentPricing,
    PaymentService,
    PaymentWorker,
    {
      provide: MOMO_CLIENT,
      useFactory: () => {
        const settings = readMomoSettings();
        return settings ? new MomoSandboxClient(settings) : null;
      },
    },
  ],
  exports: [PaymentService, PaymentPricing],
})
export class PaymentModule {}
