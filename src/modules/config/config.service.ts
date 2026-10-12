import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

import {
  TAppConfig,
  TAuthConfig,
  TDatabaseConfig,
  TMailConfig,
} from './schemas';

@Injectable()
export class ConfigService {
  constructor(
    private readonly configService: NestConfigService<
      {
        app: TAppConfig;
        auth: TAuthConfig;
        database: TDatabaseConfig;
        mail: TMailConfig;
      },
      true
    >,
  ) {}

  get app(): TAppConfig {
    return this.configService.get('app', { infer: true });
  }

  get database(): TDatabaseConfig {
    return this.configService.get('database', { infer: true });
  }

  get auth(): TAuthConfig {
    return this.configService.get('auth', { infer: true });
  }

  get mail(): TMailConfig {
    return this.configService.get('mail', { infer: true });
  }
}
