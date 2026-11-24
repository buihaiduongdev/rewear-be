import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '@/infrastructure/storage';
import { ProductModule } from '@/modules/product';

import { Media, ProductMedia } from './entities';
import { MediaUploadCleanupWorker } from './media-upload-cleanup.worker';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { ProductMediaController } from './product-media.controller';
import { ProductMediaService } from './product-media.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Media, ProductMedia]),
    ProductModule,
    StorageModule,
  ],
  controllers: [MediaController, ProductMediaController],
  providers: [MediaService, ProductMediaService, MediaUploadCleanupWorker],
  exports: [MediaService],
})
export class MediaModule {}
