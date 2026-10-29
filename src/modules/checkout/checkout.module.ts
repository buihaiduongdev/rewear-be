import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CartModule } from '@/modules/cart';

import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { Checkout, CheckoutOrder } from './entities/checkout.entity';

@Module({
  imports: [CartModule, TypeOrmModule.forFeature([Checkout, CheckoutOrder])],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
