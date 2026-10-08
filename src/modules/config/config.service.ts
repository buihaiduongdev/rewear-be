import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

import { TAppConfig, TDatabaseConfig } from './schemas';

@Injectable()
export class ConfigService {
  constructor(
    private readonly configService: NestConfigService<
      { app: TAppConfig; database: TDatabaseConfig },
      true
    >,
  ) {}

  get app(): TAppConfig {
    return this.configService.get('app', { infer: true });
  }

  get database(): TDatabaseConfig {
    return this.configService.get('database', { infer: true });
  }
}
