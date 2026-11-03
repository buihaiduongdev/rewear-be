import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { Category } from '@/modules/category/entities';
import { MediaLink } from '@/modules/media/entities';
import { MediaOwnerType, MediaRole } from '@/modules/media/enums';
import { Product, ProductRevision } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { Shop, ShopMember } from '@/modules/shop/entities';
import {
  ShopMemberRole,
  ShopMemberStatus,
  ShopStatus,
} from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserStatus } from '@/modules/user/enums';

import { Cart, CartItem } from './entities';
import { CartAvailability } from './enums/cart-availability.enum';
import type { CartView } from './schemas/cart.schema';

const DISPLAYABLE_STATES = [
  ProductStatus.ACTIVE,
  ProductStatus.HELD,
  ProductStatus.SOLD,
];

@Injectable()
export class CartService {
  constructor(private readonly dataSource: DataSource) {}

  // A consistent read keeps current content, source eligibility, images and totals
  // in the same DB snapshot. It does not reserve any product.
  findMine(userId: string): Promise<CartView> {
    return this.dataSource.transaction('REPEATABLE READ', (manager) =>
      this.readCart(manager, userId),
    );
  }

  async add(userId: string, productId: string): Promise<CartView> {
    await this.dataSource.transaction(async (manager) => {
      // Short-lived read lock only: listing edits/reviews cannot cross this check.
      const product = await manager.findOne(Product, {
        where: { id: productId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!product) throw new NotFoundException('Product not found');
      if (
        product.sellerUserId === userId ||
        (product.shopId &&
          (await manager.existsBy(ShopMember, {
            shopId: product.shopId,
            userId,
            memberRole: ShopMemberRole.OWNER,
            status: ShopMemberStatus.ACTIVE,
          })))
      )
        throw new ForbiddenException('Cannot add your own product to the cart');

      product.category = product.categoryId
        ? await manager.findOneBy(Category, { id: product.categoryId })
        : null;
      product.seller = product.sellerUserId
        ? await manager.findOneBy(User, { id: product.sellerUserId })
        : null;
      product.shop = product.shopId
        ? await manager.findOneBy(Shop, { id: product.shopId })
        : null;
      const approved =
        product.approvedRevision !== null &&
        (await manager.existsBy(ProductRevision, {
          productId,
          revision: product.approvedRevision,
          decision: 'APPROVED',
        }));
      if (
        !this.canDisplay(product, approved) ||
        product.status !== ProductStatus.ACTIVE
      ) {
        throw new ConflictException('Product is not available');
      }
      await manager
        .createQueryBuilder()
        .insert()
        .into(Cart)
        .values({ userId })
        .orIgnore()
        .execute();
      const cart = await manager.findOneByOrFail(Cart, { userId });
      // DB unique constraints protect both first-cart creation and duplicate adds.
      await manager
        .createQueryBuilder()
        .insert()
        .into(CartItem)
        .values({ cartId: cart.id, productId })
        .orIgnore()
        .execute();
    });
    return this.findMine(userId);
  }

  async remove(userId: string, productId: string): Promise<void> {
    const cart = await this.dataSource
      .getRepository(Cart)
      .findOneBy({ userId });
    if (cart)
      await this.dataSource
        .getRepository(CartItem)
        .delete({ cartId: cart.id, productId });
  }

  private canDisplay(product: Product, approved: boolean): boolean {
    return (
      approved &&
      product.approvedRevision === product.revision &&
      DISPLAYABLE_STATES.includes(product.status) &&
      !!product.title &&
      product.price !== null &&
      product.price > 0 &&
      product.condition !== null &&
      product.category?.isActive === true &&
      (product.shopId !== null
        ? product.shop?.status === ShopStatus.ACTIVE
        : product.seller?.status === UserStatus.ACTIVE)
    );
  }

  async readCart(manager: EntityManager, userId: string): Promise<CartView> {
    const result: CartView = {
      groups: [],
      summary: {
        itemCount: 0,
        availableItemCount: 0,
        totalPrice: 0,
        currency: 'VND',
      },
    };
    const cart = await manager.findOneBy(Cart, { userId });
    if (!cart) return result;
    const items = await manager.find(CartItem, {
      where: { cartId: cart.id },
      relations: { product: { category: true, seller: true, shop: true } },
      order: { createdAt: 'DESC', id: 'ASC' },
    });
    if (!items.length) return result;
    const memberships = await manager.find(ShopMember, {
      where: {
        userId,
        memberRole: ShopMemberRole.OWNER,
        status: ShopMemberStatus.ACTIVE,
      },
      select: { shopId: true },
    });
    const ownedShops = new Set(memberships.map((member) => member.shopId));
    const candidates = items.filter(
      ({ product }) =>
        product.approvedRevision !== null &&
        product.approvedRevision === product.revision &&
        DISPLAYABLE_STATES.includes(product.status),
    );
    const revisions = candidates.length
      ? await manager.find(ProductRevision, {
          where: candidates.map(({ product }) => ({
            productId: product.id,
            revision: product.approvedRevision!,
            decision: 'APPROVED' as const,
          })),
          select: { id: true, productId: true },
        })
      : [];
    const approvedProducts = new Set(
      revisions.map((revision) => revision.productId),
    );
    const productByRevision = new Map(
      revisions.map((revision) => [revision.id, revision.productId]),
    );
    const covers = revisions.length
      ? await manager.find(MediaLink, {
          where: {
            ownerType: MediaOwnerType.PRODUCT_REVISION,
            ownerId: In(revisions.map((revision) => revision.id)),
            role: MediaRole.COVER,
          },
          relations: { media: true },
        })
      : [];
    const coverUrls = new Map(
      covers.map((link) => [
        productByRevision.get(link.ownerId)!,
        link.media.url,
      ]),
    );
    const groups = new Map<string, CartView['groups'][number]>();

    for (const item of items) {
      const product = item.product;
      const displayable = this.canDisplay(
        product,
        approvedProducts.has(product.id),
      );
      const own =
        product.sellerUserId === userId ||
        (product.shopId !== null && ownedShops.has(product.shopId));
      const availability = !displayable
        ? CartAvailability.UNAVAILABLE
        : own
          ? CartAvailability.OWN_PRODUCT
          : product.status === ProductStatus.HELD
            ? CartAvailability.HELD
            : product.status === ProductStatus.SOLD
              ? CartAvailability.SOLD
              : CartAvailability.AVAILABLE;
      const source = !displayable
        ? null
        : product.shopId
          ? {
              type: 'SHOP' as const,
              id: product.shopId,
              name: product.shop!.name,
            }
          : {
              type: 'USER' as const,
              id: product.sellerUserId!,
              name: product.seller!.fullName,
            };
      const key = source ? `${source.type}:${source.id}` : 'UNAVAILABLE';
      let group = groups.get(key);
      if (!group) {
        group = { source, items: [] };
        groups.set(key, group);
      }
      group.items.push({
        productId: item.productId,
        addedAt: item.createdAt,
        availability,
        // Hide current draft/rejected/suspended content from former cart holders.
        product: displayable
          ? {
              id: product.id,
              title: product.title!,
              price: product.price!,
              condition: product.condition!,
              size: product.size,
              color: product.color,
              coverUrl: coverUrls.get(product.id) ?? null,
            }
          : null,
      });
      result.summary.itemCount += 1;
      if (availability === CartAvailability.AVAILABLE) {
        result.summary.availableItemCount += 1;
        result.summary.totalPrice += product.price!;
      }
    }
    result.groups = [...groups.values()];
    return result;
  }
}
