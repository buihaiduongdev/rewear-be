import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '@/infrastructure/storage';
import { AuthorizationModule } from '@/modules/authorization/authorization.module';
import { Category } from '@/modules/category/entities';
import { Media, ProductMedia } from '@/modules/media/entities';
import { Shop, ShopMember } from '@/modules/shop/entities';

import { Product, ProductModeration } from './entities';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  imports: [
    StorageModule,
    AuthorizationModule,
    TypeOrmModule.forFeature([
      Product,
      ProductModeration,
      Media,
      ProductMedia,
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
