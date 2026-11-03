import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { LoggingMiddleware, RequestIdMiddleware } from './common/middlewares';
import { createRequestValidationPipe } from './common/validation';
import { AdministrativeDivisionModule } from './modules/administrative-division';
import { AuthModule } from './modules/auth';
import { CartModule } from './modules/cart';
import { CategoryModule } from './modules/category';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { ConfigModule, ConfigService } from './modules/config';
import { DatabaseModule } from './modules/database';
import { MediaModule } from './modules/media';
import { ProductModule } from './modules/product';
import { ShippingModule } from './modules/shipping/shipping.module';
import { ShopModule } from './modules/shop';
import { UserModule } from './modules/user';
import { UserAddressModule } from './modules/user-address';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AdministrativeDivisionModule,
    CategoryModule,
    CartModule,
    CheckoutModule,
    ShopModule,
    ShippingModule,
    ProductModule,
    MediaModule,
    UserModule,
    UserAddressModule,
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
