import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '@/infrastructure/storage';
import { ProductMedia } from '@/modules/media/entities';
import { Product } from '@/modules/product/entities';

import { WishlistItem } from './entities';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

@Module({
  imports: [
    StorageModule,
    TypeOrmModule.forFeature([WishlistItem, Product, ProductMedia]),
  ],
  controllers: [WishlistController],
  providers: [WishlistService],
  exports: [WishlistService],
})
export class WishlistModule {}
