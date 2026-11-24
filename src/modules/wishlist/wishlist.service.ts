import { Injectable, NotFoundException } from '@nestjs/common';

import { DataSource, In } from 'typeorm';

import { ProductMedia } from '@/modules/media/entities';
import { MediaRole } from '@/modules/media/enums';
import { Product } from '@/modules/product/entities';
import { ProductCondition } from '@/modules/product/enums';
import { evaluateProductAvailability } from '@/modules/product/machines/product-availability.machine';

import { WishlistItem } from './entities';
import type { WishlistView } from './schemas/wishlist.schema';

@Injectable()
export class WishlistService {
  constructor(private readonly dataSource: DataSource) {}

  async findMine(userId: string): Promise<WishlistView> {
    const items = await this.dataSource.getRepository(WishlistItem).find({
      where: { userId },
      relations: { product: { shop: true, category: true } },
      order: { createdAt: 'DESC' },
    });

    if (!items.length) {
      return { items: [], totalCount: 0 };
    }

    const covers = await this.dataSource.getRepository(ProductMedia).find({
      where: {
        productId: In(items.map((i) => i.productId)),
        role: MediaRole.COVER,
      },
      relations: { media: true },
    });
    const coverUrls = new Map(covers.map((c) => [c.productId, c.media.url]));

    const mappedItems = items.map((item) => {
      const p = item.product;
      const availability = evaluateProductAvailability(p);

      return {
        id: item.id,
        productId: item.productId,
        addedAt: item.createdAt,
        availability,
        product: p
          ? {
              id: p.id,
              title: p.title ?? '',
              price: p.price ?? 0,
              condition: p.condition ?? ProductCondition.GOOD,
              size: p.size,
              color: p.color,
              coverUrl: coverUrls.get(p.id) ?? null,
              shop: p.shop
                ? {
                    id: p.shop.id,
                    name: p.shop.name,
                    logoUrl: p.shop.logoUrl ?? null,
                  }
                : null,
            }
          : null,
      };
    });

    return {
      items: mappedItems,
      totalCount: mappedItems.length,
    };
  }

  async add(userId: string, productId: string): Promise<WishlistView> {
    const product = await this.dataSource
      .getRepository(Product)
      .findOneBy({ id: productId });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(WishlistItem)
      .values({ userId, productId })
      .orIgnore()
      .execute();

    return this.findMine(userId);
  }

  async remove(userId: string, productId: string): Promise<WishlistView> {
    await this.dataSource
      .getRepository(WishlistItem)
      .delete({ userId, productId });

    return this.findMine(userId);
  }
}
