import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';
import { MediaRole } from '@/modules/media/enums';
import { Product } from '@/modules/product/entities';
import { evaluateProductAvailability } from '@/modules/product/machines/product-availability.machine';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';

import { CartItem } from './entities';
import { CartAvailability } from './enums/cart-availability.enum';
import type { CartView } from './schemas/cart.schema';

@Injectable()
export class CartService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  async findMine(
    userId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<CartView> {
    const items = await manager
      .createQueryBuilder(CartItem, 'item')
      .innerJoin('item.cart', 'cart', 'cart.userId = :userId', { userId })
      .innerJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .innerJoinAndSelect('product.shop', 'shop')
      .leftJoinAndSelect(
        'product.media',
        'coverLink',
        'coverLink.role = :coverRole',
        { coverRole: MediaRole.COVER },
      )
      .leftJoinAndSelect('coverLink.media', 'coverMedia')
      .orderBy('item.createdAt', 'DESC')
      .addOrderBy('item.id', 'ASC')
      .getMany();

    return this.populateCartView(items);
  }

  async add(userId: string, productId: string): Promise<CartView> {
    await this.dataSource.transaction(async (manager) => {
      const product = (await manager
        .createQueryBuilder(Product, 'product')
        .setLock('pessimistic_read', undefined, ['product'])
        .leftJoinAndSelect('product.category', 'category')
        .innerJoinAndSelect('product.shop', 'shop')
        .leftJoinAndMapOne(
          'shop.ownerMembership',
          ShopMember,
          'ownerMember',
          'ownerMember.shopId = shop.id AND ownerMember.userId = :userId AND ownerMember.memberRole = :ownerRole',
          { userId, ownerRole: ShopMemberRole.OWNER },
        )
        .where('product.id = :productId', { productId })
        .getOneOrFail()) as Product & {
        shop: Shop & { ownerMembership?: ShopMember };
      };

      if (product.shop.ownerMembership) {
        throw new ForbiddenException('Cannot add your own product to the cart');
      }
      if (
        evaluateProductAvailability(product, {
          requirePurchaseEligibility: true,
          requireCompleteMetadata: true,
        }) !== CartAvailability.AVAILABLE
      ) {
        throw new ConflictException('Product is not available');
      }

      await manager.query(
        `
        WITH inserted AS (
          INSERT INTO carts ("userId") VALUES ($1)
          ON CONFLICT ("userId") DO NOTHING
          RETURNING id
        ), ensured_cart AS (
          SELECT id FROM inserted
          UNION ALL
          SELECT id FROM carts WHERE "userId" = $1
          LIMIT 1
        )
        INSERT INTO cart_items ("cartId", "productId")
        SELECT id, $2 FROM ensured_cart
        ON CONFLICT ("cartId", "productId") DO NOTHING
        `,
        [userId, productId],
      );
    });
    return this.findMine(userId);
  }

  async remove(userId: string, productId: string): Promise<CartView> {
    await this.dataSource.query(
      `
      DELETE FROM cart_items ci
      USING carts c
      WHERE ci."cartId" = c.id
        AND c."userId" = $1
        AND ci."productId" = $2
      `,
      [userId, productId],
    );
    return this.findMine(userId);
  }

  private populateCartView(items: CartItem[]): CartView {
    const groups = new Map<string, CartView['groups'][number]>();
    const summary: CartView['summary'] = {
      itemCount: 0,
      availableItemCount: 0,
      totalPrice: 0,
      currency: 'VND',
    };

    for (const item of items) {
      const product = item.product;
      const availability = evaluateProductAvailability(product, {
        requirePurchaseEligibility: true,
        requireCompleteMetadata: true,
      });

      let group = groups.get(product.shopId);
      if (!group) {
        group = {
          shop: {
            id: product.shopId,
            name: product.shop.name,
          },
          items: [],
        } satisfies CartView['groups'][number];
        groups.set(product.shopId, group);
      }

      const cover = product.media?.[0]?.media;
      group.items.push({
        productId: item.productId,
        addedAt: item.createdAt,
        availability,
        product: {
          id: product.id,
          title: product.title!,
          price: product.price!,
          condition: product.condition!,
          size: product.size,
          color: product.color,
          coverUrl: cover ? this.storage.getPublicUrl(cover.storageKey) : null,
        },
      });

      summary.itemCount += 1;
      if (availability === CartAvailability.AVAILABLE) {
        summary.availableItemCount += 1;
        summary.totalPrice += product.price!;
      }
    }

    return { groups: [...groups.values()], summary };
  }
}
