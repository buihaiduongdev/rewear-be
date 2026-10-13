import { Module } from '@nestjs/common';

import { STORAGE_PROVIDER } from '../../storage.interface';
import { R2Service } from './r2.service';

@Module({
  providers: [{ provide: STORAGE_PROVIDER, useClass: R2Service }],
  exports: [STORAGE_PROVIDER],
})
export class R2ProviderModule {}
