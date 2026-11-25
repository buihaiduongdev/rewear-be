import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PayosModule } from '@/infrastructure/payment/payos.module';
import { CheckoutModule } from '@/modules/checkout/checkout.module';
import { FeePaymentModule } from '@/modules/fees/payments/fee-payment.module';
import { Order } from '@/modules/order/entities';
import { WalletExcessModule } from '@/modules/wallet/excess/wallet-excess.module';

import { PaymentAttempt, PaymentRefund } from './entities';
import { PaymentController } from './payment.controller';
import { PaymentPricing } from './payment.pricing';
import { PaymentService } from './payment.service';
import { PaymentWorker } from './payment.worker';

@Module({
  imports: [
    PayosModule,
    WalletExcessModule,
    CheckoutModule,
    FeePaymentModule,
    TypeOrmModule.forFeature([PaymentAttempt, PaymentRefund, Order]),
  ],
  controllers: [PaymentController],
  providers: [PaymentPricing, PaymentService, PaymentWorker],
  exports: [PaymentService, PaymentPricing],
})
export class PaymentModule {}
