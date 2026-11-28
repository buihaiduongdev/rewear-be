import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CodModule } from '@/modules/cod/cod.module';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';
import { ShopSettlement } from '@/modules/shop-finance/entities/shop-settlement.entity';
import { WalletModule } from '@/modules/wallet/wallet.module';

import { Order, OrderEvent } from './entities';
import { OrderDeliveryVerification } from './entities/order-delivery-verification.entity';
import { OrderFundingService } from './order-funding.service';
import { OrderSettlementController } from './order-settlement.controller';
import { OrderSettlementService } from './order-settlement.service';
import { OrderSettlementWorker } from './order-settlement.worker';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderWorker } from './order.worker';

@Module({
  imports: [
    WalletModule,
    forwardRef(() => CodModule),
    TypeOrmModule.forFeature([
      Order,
      OrderEvent,
      OrderDeliveryVerification,
      ShopSettlement,
      ShopLedgerEntry,
    ]),
  ],
  controllers: [OrderController, OrderSettlementController],
  providers: [
    OrderService,
    OrderWorker,
    OrderFundingService,
    OrderSettlementService,
    OrderSettlementWorker,
  ],
  exports: [OrderService, OrderFundingService],
})
export class OrderModule {}
