import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Category } from '@/modules/category/entities';
import { Media, MediaLink } from '@/modules/media/entities';
import { Shop, ShopMember } from '@/modules/shop/entities';

import { Product, ProductRevision } from './entities';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductRevision,
      Media,
      MediaLink,
      Category,
      Shop,
      ShopMember,
    ]),
  ],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
