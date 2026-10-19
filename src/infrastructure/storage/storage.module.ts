import { Module } from '@nestjs/common';

import { R2StorageModule } from './provider/r2/r2-storage.module';
import { StorageService } from './storage.service';

@Module({
  imports: [R2StorageModule],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
