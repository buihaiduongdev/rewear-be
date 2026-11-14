import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GhnSandboxAdapter } from '@/infrastructure/shipping/ghn-sandbox.adapter';
import { CartModule } from '@/modules/cart';

import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { CheckoutOrder } from './entities/checkout-order.entity';
import { Checkout } from './entities/checkout.entity';
import { ShippingQuoteService } from './shipping-quote.service';

@Module({
  imports: [CartModule, TypeOrmModule.forFeature([Checkout, CheckoutOrder])],
  controllers: [CheckoutController],
  providers: [CheckoutService, ShippingQuoteService, GhnSandboxAdapter],
  exports: [CheckoutService, ShippingQuoteService],
})
export class CheckoutModule {}
