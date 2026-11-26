import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { LoggingMiddleware, RequestIdMiddleware } from './common/middlewares';
import { createRequestValidationPipe } from './common/validation';
import { DatabaseModule } from './database';
import { QueueModule } from './infrastructure/queue/queue.module';
import { AdministrativeDivisionModule } from './modules/administrative-division';
import { AuthModule } from './modules/auth';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { CartModule } from './modules/cart';
import { CategoryModule } from './modules/category';
import { ChatModule } from './modules/chat/chat.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { CodReconciliationModule } from './modules/cod-reconciliation/cod-reconciliation.module';
import { CodModule } from './modules/cod/cod.module';
import { CoinsModule } from './modules/coins/coins.module';
import { ConfigModule, ConfigService } from './modules/config';
import { DisputeModule } from './modules/dispute/dispute.module';
import { EventModule } from './modules/event/event.module';
import { MediaModule } from './modules/media';
import { NotificationModule } from './modules/notifications/notification.module';
import { OrderModule } from './modules/order/order.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ProductModule } from './modules/product';
import { RatingsModule } from './modules/ratings/ratings.module';
import { ReportModule } from './modules/reports/report.module';
import { ShipmentModule } from './modules/shipment/shipment.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { ShopModule } from './modules/shop';
import { ShopFinanceModule } from './modules/shop-finance/shop-finance.module';
import { ShopFollowModule } from './modules/shop-follows/shop-follow.module';
import { UserModule } from './modules/user';
import { UserAddressModule } from './modules/user-address';
import { WishlistModule } from './modules/wishlist';

@Module({
  imports: [
    ...(process.env.NODE_ENV === 'test' ? [] : [ScheduleModule.forRoot()]),
    ConfigModule,
    DatabaseModule,
    QueueModule,
    EventModule,
    AdministrativeDivisionModule,
    CategoryModule,
    CartModule,
    ChatModule,
    CheckoutModule,
    PaymentModule,
    AuthorizationModule,
    OrderModule,
    DisputeModule,
    CodModule,
    CoinsModule,
    RatingsModule,
    ReportModule,
    CodReconciliationModule,
    ShopFinanceModule,
    ShopFollowModule,
    ShopModule,
    ShippingModule,
    ShipmentModule,
    ProductModule,
    MediaModule,
    NotificationModule,
    UserModule,
    UserAddressModule,
    WishlistModule,
    AuthModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [configService.app.rateLimit],
      }),
    }),
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createRequestValidationPipe },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, LoggingMiddleware).forRoutes('{*path}');
  }
}
