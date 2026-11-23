import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MomoSandboxClient } from '@/infrastructure/payment/momo-sandbox.client';
import { CheckoutModule } from '@/modules/checkout/checkout.module';
import { FeePaymentModule } from '@/modules/fees/payments/fee-payment.module';
import { Order } from '@/modules/order/entities/order.entity';
import { WalletExcessModule } from '@/modules/wallet/excess/wallet-excess.module';

import { PaymentAttempt, PaymentRefund } from './entities/payment.entity';
import { MOMO_CLIENT, readMomoSettings } from './payment.config';
import { PaymentController } from './payment.controller';
import { PaymentPricing } from './payment.pricing';
import { PaymentService } from './payment.service';
import { PaymentWorker } from './payment.worker';

@Module({
  imports: [
    WalletExcessModule,
    CheckoutModule,
    FeePaymentModule,
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
