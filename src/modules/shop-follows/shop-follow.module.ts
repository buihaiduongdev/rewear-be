import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '@/infrastructure/storage';

import { ShopFollow } from './entities/shop-follow.entity';
import { ShopFollowFeedService } from './shop-follow-feed.service';
import { ShopFollowController } from './shop-follow.controller';
import { ShopFollowService } from './shop-follow.service';

@Module({
  imports: [StorageModule, TypeOrmModule.forFeature([ShopFollow])],
  controllers: [ShopFollowController],
  providers: [ShopFollowService, ShopFollowFeedService],
  exports: [ShopFollowService],
})
export class ShopFollowModule {}
