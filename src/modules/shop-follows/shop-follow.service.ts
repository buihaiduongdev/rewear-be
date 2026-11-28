import { Injectable } from '@nestjs/common';

import { DataSource, In } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';
import { ProductMedia } from '@/modules/media/entities';
import { MediaRole, MediaType } from '@/modules/media/enums';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';

import { ShopFollow } from './entities/shop-follow.entity';
import type { ShopFollowQuery } from './schemas/shop-follow.schema';

@Injectable()
export class ShopFollowService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
  ) {}

  async follow(userId: string, shopId: string) {
    const manager = this.dataSource.manager;
    const existing = await manager.findOneBy(ShopFollow, { userId, shopId });
    if (existing) {
      return { shopId, following: true, followedAt: existing.createdAt };
    }
    await manager.findOneByOrFail(Shop, {
      id: shopId,
      status: ShopStatus.ACTIVE,
    });
    await manager
      .createQueryBuilder()
      .insert()
      .into(ShopFollow)
      .values({ userId, shopId })
      .orIgnore()
      .execute();
    const row = await manager.findOneByOrFail(ShopFollow, { userId, shopId });
    return { shopId, following: true, followedAt: row.createdAt };
  }

  async unfollow(userId: string, shopId: string) {
    await this.dataSource.manager.delete(ShopFollow, { userId, shopId });
    return { shopId, following: false, followedAt: null };
  }

  async state(userId: string, shopId: string) {
    const manager = this.dataSource.manager;
    const row = await manager.findOneBy(ShopFollow, { userId, shopId });
    if (!row) {
      await manager.findOneByOrFail(Shop, {
        id: shopId,
        status: ShopStatus.ACTIVE,
      });
    }
    return { shopId, following: !!row, followedAt: row?.createdAt ?? null };
  }

  async list(userId: string, input: ShopFollowQuery) {
    const [rows, totalCount] = await this.dataSource.manager.findAndCount(
      ShopFollow,
      {
        where: { userId },
        relations: { shop: true },
        order: { createdAt: 'DESC', id: 'DESC' },
        take: input.limit,
        skip: input.offset,
      },
    );
    return {
      items: rows.map((row) => ({
        shopId: row.shopId,
        followedAt: row.createdAt,
        shop: {
          id: row.shop.id,
          name: row.shop.name,
          status: row.shop.status,
        },
      })),
      totalCount,
      ...input,
    };
  }

  async products(userId: string, input: ShopFollowQuery) {
    const manager = this.dataSource.manager;
    const [products, totalCount] = await manager
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
      .andWhere('product.title IS NOT NULL AND product.price > 0')
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
    const coverByProductId = new Map<string, string>();
    for (const link of links) {
      if (
        !coverByProductId.has(link.productId) &&
        link.media.retiredAt === null &&
        link.media.mediaType === MediaType.IMAGE
      ) {
        coverByProductId.set(
          link.productId,
          this.storageService.getPublicUrl(link.media.storageKey),
        );
      }
    }
    return {
      items: products.map((product) => ({
        id: product.id,
        title: product.title!,
        price: product.price!,
        condition: product.condition,
        size: product.size,
        coverUrl: coverByProductId.get(product.id) ?? null,
        publishedAt: product.publishedAt!,
        shop: { id: product.shop.id, name: product.shop.name },
      })),
      totalCount,
      ...input,
    };
  }
}
