import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

import {
  TAiConfig,
  TAppConfig,
  TAuthConfig,
  TCorsConfig,
  TDatabaseConfig,
  TMailConfig,
  TStorageConfig,
} from './schemas';

@Injectable()
export class ConfigService {
  constructor(
    private readonly configService: NestConfigService<
      {
        ai: TAiConfig;
        app: TAppConfig;
        auth: TAuthConfig;
        cors: TCorsConfig;
        database: TDatabaseConfig;
        mail: TMailConfig;
        storage: TStorageConfig;
      },
      true
    >,
  ) {}

  get app(): TAppConfig {
    return this.configService.get('app', { infer: true });
  }

  get cors(): TCorsConfig {
    return this.configService.get('cors', { infer: true });
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

  get ai(): TAiConfig {
    return this.configService.get('ai', { infer: true });
  }

  get storage(): TStorageConfig {
    return this.configService.get('storage', { infer: true });
  }
}
