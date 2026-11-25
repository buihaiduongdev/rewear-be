import { Module } from '@nestjs/common';

import { OrderModule } from '@/modules/order/order.module';
import { PaymentModule } from '@/modules/payment/payment.module';
import { ShopFinanceModule } from '@/modules/shop-finance/shop-finance.module';

import { CodPolicyModule } from './cod-policy.module';
import { CodController } from './cod.controller';
import { CodService } from './cod.service';

@Module({
  imports: [CodPolicyModule, OrderModule, PaymentModule, ShopFinanceModule],
  providers: [CodService],
  controllers: [CodController],
  exports: [CodService],
})
export class CodModule {}
