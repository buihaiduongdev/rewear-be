import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PayosModule } from '@/infrastructure/payment/payos.module';
import { CheckoutModule } from '@/modules/checkout/checkout.module';
import { Order } from '@/modules/order/entities';
import { WalletModule } from '@/modules/wallet/wallet.module';

import { PaymentAttempt, PaymentRefund } from './entities';
import { MomoClient } from './momo.client';
import { MOMO_CLIENT, readMomoSettings } from './payment.config';
import { PaymentController } from './payment.controller';
import { PaymentPricing } from './payment.pricing';
import { PaymentService } from './payment.service';
import { PaymentWorker } from './payment.worker';

@Module({
  imports: [
    PayosModule,
    CheckoutModule,
    forwardRef(() => WalletModule),
    TypeOrmModule.forFeature([PaymentAttempt, PaymentRefund, Order]),
  ],
  controllers: [PaymentController],
  providers: [
    {
      provide: MOMO_CLIENT,
      useFactory: () => {
        const settings = readMomoSettings();
        return settings ? new MomoClient(settings) : null;
      },
    },
    PaymentPricing,
    PaymentService,
    PaymentWorker,
  ],
  exports: [PaymentService, PaymentPricing, MOMO_CLIENT],
})
export class PaymentModule {}
