import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '@/infrastructure/storage';
import { AuthorizationModule } from '@/modules/authorization/authorization.module';
import { MediaModule } from '@/modules/media/media.module';

import { ShopRating, ShopRatingMedia, ShopRatingVersion } from './entities';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';

@Module({
  imports: [
    StorageModule,
    MediaModule,
    AuthorizationModule,
    TypeOrmModule.forFeature([ShopRating, ShopRatingVersion, ShopRatingMedia]),
  ],
  controllers: [RatingsController],
  providers: [RatingsService],
  exports: [RatingsService],
})
export class RatingsModule {}
