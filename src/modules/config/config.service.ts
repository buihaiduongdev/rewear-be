import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

import { TAppConfig } from './app.schema';

@Injectable()
export class ConfigService {
  constructor(
    private readonly configService: NestConfigService<
      { app: TAppConfig },
      true
    >,
  ) {}

  get app(): TAppConfig {
    return this.configService.get('app', { infer: true });
  }
}
