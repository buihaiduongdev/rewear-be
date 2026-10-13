import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { ConfigService } from './config.service';
import {
  appConfig,
  authConfig,
  corsConfig,
  databaseConfig,
  mailConfig,
} from './configs';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      cache: true,
      envFilePath: '.env',
      isGlobal: true,
      load: [appConfig, authConfig, corsConfig, databaseConfig, mailConfig],
    }),
  ],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
