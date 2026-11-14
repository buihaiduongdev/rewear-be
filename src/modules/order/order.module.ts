import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WalletModule } from '@/modules/wallet/wallet.module';

import { OrderAccess } from './order.access';
import { OrderController } from './order.controller';
import { Order, OrderEvent } from './order.entity';
import { OrderService } from './order.service';
import { OrderWorker } from './order.worker';

@Module({
  imports: [WalletModule, TypeOrmModule.forFeature([Order, OrderEvent])],
  controllers: [OrderController],
  providers: [OrderAccess, OrderService, OrderWorker],
  exports: [OrderService],
})
export class OrderModule {}
