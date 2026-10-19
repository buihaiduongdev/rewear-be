import { Module } from '@nestjs/common';

import { STORAGE_PROVIDER } from '../../storage.interface';
import { R2StorageService } from './r2-storage.service';

@Module({
  providers: [
    R2StorageService,
    { provide: STORAGE_PROVIDER, useExisting: R2StorageService },
  ],
  exports: [STORAGE_PROVIDER],
})
export class R2StorageModule {}
