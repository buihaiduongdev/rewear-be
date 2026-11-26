import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrderModule } from '@/modules/order/order.module';
import { PaymentModule } from '@/modules/payment/payment.module';
import { ShopFinanceModule } from '@/modules/shop-finance/shop-finance.module';

import { CodController } from './cod.controller';
import { CodService } from './cod.service';
import { CodBuyerCancellation, CodRestriction } from './entities';
import { CodPolicy } from './policies/cod.policy';

@Module({
  imports: [
    TypeOrmModule.forFeature([CodBuyerCancellation, CodRestriction]),
    forwardRef(() => OrderModule),
    PaymentModule,
    forwardRef(() => ShopFinanceModule),
  ],
  providers: [CodPolicy, CodService],
  controllers: [CodController],
  exports: [CodPolicy, CodService],
})
export class CodModule {}
