import { Injectable } from '@nestjs/common';

import { DataSource, In } from 'typeorm';

import { ProductMedia } from '@/modules/media/entities';
import { MediaRole, MediaType } from '@/modules/media/enums';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { ShopStatus } from '@/modules/shop/enums';

import { ShopFollow } from './entities/shop-follow.entity';
import { assertFollowUser } from './policies/shop-follow-access.policy';
import type { ShopFollowQuery } from './types/shop-follow.type';

@Injectable()
export class ShopFollowFeedService {
  constructor(private readonly db: DataSource) {}
  products(userId: string, input: ShopFollowQuery) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      await assertFollowUser(manager, userId);
      const query = manager
        .createQueryBuilder(Product, 'product')
        .innerJoin(
          ShopFollow,
          'follow',
          'follow.shopId = product.shopId AND follow.userId = :userId',
          { userId },
        )
        .innerJoinAndSelect('product.shop', 'shop')
        .innerJoin('product.category', 'category')
        .innerJoin(
          ProductModeration,
          'moderation',
          'moderation.productId = product.id AND moderation.status = :approved',
          { approved: ProductModerationStatus.APPROVED },
        )
        .where('product.status = :status', { status: ProductStatus.ACTIVE })
        .andWhere('shop.status = :shopStatus', {
          shopStatus: ShopStatus.ACTIVE,
        })
        .andWhere('category.isActive = true')
        .andWhere('product.publishedAt <= CURRENT_TIMESTAMP')
        .andWhere('product.title IS NOT NULL AND product.price > 0');
      const [products, totalCount] = await query
        .orderBy('product.publishedAt', 'DESC')
        .addOrderBy('product.id', 'DESC')
        .take(input.limit)
        .skip(input.offset)
        .getManyAndCount();
      const links = products.length
        ? await manager.find(ProductMedia, {
            where: {
              productId: In(products.map((product) => product.id)),
              role: MediaRole.COVER,
            },
            relations: { media: true },
          })
        : [];
      return {
        items: products.map((product) => {
          const cover = links.find(
            (link) =>
              link.productId === product.id &&
              link.media.retiredAt === null &&
              link.media.mediaType === MediaType.IMAGE,
          );
          return {
            id: product.id,
            title: product.title!,
            price: product.price!,
            condition: product.condition,
            size: product.size,
            coverUrl: cover?.media.url ?? null,
            publishedAt: product.publishedAt!,
            shop: { id: product.shop.id, name: product.shop.name },
          };
        }),
        totalCount,
        ...input,
      };
    });
  }
}
