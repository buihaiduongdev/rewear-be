import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GhnSandboxAdapter } from '@/infrastructure/shipping/ghn-sandbox.adapter';
import { CartModule } from '@/modules/cart';

import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { Checkout, CheckoutOrder } from './entities/checkout.entity';
import { CheckoutShippingQuote } from './entities/shipping-quote.entity';
import { ShippingQuoteService } from './shipping-quote.service';

@Module({
  imports: [
    CartModule,
    TypeOrmModule.forFeature([Checkout, CheckoutOrder, CheckoutShippingQuote]),
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService, ShippingQuoteService, GhnSandboxAdapter],
  exports: [CheckoutService],
})
export class CheckoutModule {}
