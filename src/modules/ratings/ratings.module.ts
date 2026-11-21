import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';
import { AuthorizationModule } from '@/modules/authorization/authorization.module';

import {
  ShopRating,
  ShopRatingMedia,
  ShopRatingModerationAudit,
  ShopRatingNotice,
  ShopRatingVersion,
} from './entities/shop-rating.entity';
import { RatingMediaService } from './rating-media.service';
import { RatingAccess } from './rating.access';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';

@Module({
  imports: [
    AuthorizationModule,
    TypeOrmModule.forFeature([
      ShopRating,
      ShopRatingVersion,
      ShopRatingNotice,
      ShopRatingModerationAudit,
      ShopRatingMedia,
    ]),
  ],
  controllers: [RatingsController],
  providers: [
    RatingAccess,
    RatingsService,
    RatingMediaService,
    PrivateEvidenceStorage,
  ],
  exports: [RatingsService],
})
export class RatingsModule {}
