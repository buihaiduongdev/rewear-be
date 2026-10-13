import { Module } from '@nestjs/common';

import { R2ProviderModule } from './provider/r2/r2.module';
import { StorageService } from './storage.service';

@Module({
  imports: [R2ProviderModule],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
