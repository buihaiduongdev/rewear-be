import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { LoggingMiddleware, RequestIdMiddleware } from './common/middlewares';
import { AdministrativeDivisionModule } from './modules/administrative-division';
import { AuthModule } from './modules/auth';
import { CategoryModule } from './modules/category';
import { ConfigModule, ConfigService } from './modules/config';
import { DatabaseModule } from './modules/database';
import { ShopModule } from './modules/shop';
import { UserModule } from './modules/user';
import { UserAddressModule } from './modules/user-address';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AdministrativeDivisionModule,
    CategoryModule,
    ShopModule,
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
