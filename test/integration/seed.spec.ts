import * as argon2 from 'argon2';
import type { DataSource } from 'typeorm';

import { DEFAULT_SEED_PASSWORD } from '@/database/seeds/catalog';
import { runInitialDataSeed } from '@/database/seeds/initial-data.seed';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { CartService } from '@/modules/cart/cart.service';
import { Cart, CartItem } from '@/modules/cart/entities';
import { Category } from '@/modules/category/entities';
import { ChatAccess } from '@/modules/chat/chat.access';
import { ChatService } from '@/modules/chat/chat.service';
import { CHECKOUT_STATUS } from '@/modules/checkout/constants/checkout.constant';
import { Checkout, CheckoutOrder } from '@/modules/checkout/entities';
import { CodPolicy } from '@/modules/cod/policies/cod.policy';
import { MediaLink } from '@/modules/media/entities';
import { NotificationService } from '@/modules/notifications/notification.service';
import { ORDER_EVENT_ACTION, ORDER_STATUS } from '@/modules/order/constants';
import { Order, OrderEvent } from '@/modules/order/entities/order.entity';
import { OrderService } from '@/modules/order/order.service';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { ProductService } from '@/modules/product/product.service';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { ShopFollowService } from '@/modules/shop-follows/shop-follow.service';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { UserAddress } from '@/modules/user-address/entities';
import { User } from '@/modules/user/entities';
import { WalletService } from '@/modules/wallet/wallet.service';
import { WishlistService } from '@/modules/wishlist/wishlist.service';

import { createTestDatabase } from '../support/database';
import type { TestDatabase } from '../support/database';

describe('Seed data (PostgreSQL)', () => {
  let database: TestDatabase;
  let db: DataSource;

  beforeAll(async () => {
    database = await createTestDatabase();
    db = database.dataSource;
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it('creates accounts, shops and public products with images', async () => {
    const seed = await db.transaction(runInitialDataSeed);
    expect(seed.users).toHaveLength(7);
    expect(seed.shops).toHaveLength(3);
    expect(seed.categories).toHaveLength(6);
    expect(seed.products).toHaveLength(36);
    expect(seed.userAddresses).toHaveLength(13);
    expect(seed.pickupLocations).toHaveLength(3);
    expect(seed.cartItems).toHaveLength(5);
    expect(seed.orders).toHaveLength(3);
    for (const shop of seed.shops) {
      const orders = await db
        .getRepository(Order)
        .findBy({ shopId: shop.id, status: ORDER_STATUS.PENDING });
      expect(orders).toHaveLength(1);
      expect(orders[0].buyerId).toBe(seed.users[1].id);
      const checkout = await db
        .getRepository(Checkout)
        .findOneByOrFail({ id: orders[0].checkoutId! });
      const checkoutOrder = await db
        .getRepository(CheckoutOrder)
        .findOneByOrFail({ id: orders[0].checkoutOrderId });
      expect(checkout.status).toBe(CHECKOUT_STATUS.COD_PLACED);
      expect(checkoutOrder.checkoutId).toBe(checkout.id);
      expect(checkoutOrder.shopId).toBe(shop.id);
      expect(orders[0].sellerConfirmBy.getTime()).toBeGreaterThan(Date.now());
      const product = await db
        .getRepository(Product)
        .findOneByOrFail({ id: orders[0].items[0].productId });
      expect(product.shopId).toBe(shop.id);
      expect(product.status).toBe(ProductStatus.HELD);
      expect(product.reservedOrderId).toBe(orders[0].id);
      expect(product.heldUntil).toBeNull();
      const placed = await db.getRepository(OrderEvent).findOneByOrFail({
        orderId: orders[0].id,
        action: ORDER_EVENT_ACTION.PLACED,
      });
      expect(placed.actorId).toBe(seed.users[1].id);
      expect(orders[0].total).toBe(orders[0].subtotal + orders[0].shippingFee);
    }
    expect(await db.getRepository(UserAddress).count()).toBe(13);
    expect(await db.getRepository(PickupLocation).count()).toBe(3);
    expect(await db.getRepository(Cart).count()).toBe(2);
    expect(await db.getRepository(CartItem).count()).toBe(5);
    expect(await db.getRepository(MediaLink).count()).toBe(39);
    const admin = await db.getRepository(User).findOneOrFail({
      where: { id: seed.users[0].id },
      select: { id: true, password: true },
    });
    expect(await argon2.verify(admin.password!, DEFAULT_SEED_PASSWORD)).toBe(
      true,
    );
    const buyer = await db.getRepository(User).findOneOrFail({
      where: { id: seed.users[1].id },
      select: { id: true, password: true },
    });
    expect(await argon2.verify(buyer.password!, DEFAULT_SEED_PASSWORD)).toBe(
      true,
    );

    const wishlist = await new WishlistService(db).findMine(buyer.id);
    expect(wishlist.totalCount).toBe(3);
    expect(wishlist.items.every((item) => item.product?.coverUrl)).toBe(true);
    const follows = await new ShopFollowService(db).list(buyer.id, {
      limit: 20,
      offset: 0,
    });
    expect(follows.totalCount).toBe(3);
    const authorization = new AuthorizationService(db);
    const chat = new ChatService(db, new ChatAccess(authorization));
    const conversations = await chat.list(buyer.id, { limit: 20, offset: 0 });
    expect(conversations.items).toHaveLength(3);
    const sellerConversations = await chat.list(seed.users[2].id, {
      limit: 20,
      offset: 0,
    });
    expect(sellerConversations.items[0].unreadCount).toBe(1);
    const notifications = new NotificationService(db, authorization);
    expect((await notifications.unread(seed.users[2].id)).count).toBe(1);

    const products = new ProductService(
      db.getRepository(Product),
      db.getRepository(Category),
      db.getRepository(Shop),
      db.getRepository(ShopMember),
      db,
      new AuthorizationService(db),
    );
    const result = await products.findAll({ path: '/products', limit: 100 });
    expect(result.data).toHaveLength(30);
    expect(
      result.data.every(
        (product) =>
          product.status === ProductStatus.ACTIVE &&
          product.mediaCount === 1 &&
          product.coverUrl,
      ),
    ).toBe(true);

    const cartService = new CartService(db);
    const adminCartView = await cartService.findMine(admin.id);
    expect(adminCartView.summary.itemCount).toBe(3);
    expect(adminCartView.summary.availableItemCount).toBe(3);
    expect(adminCartView.groups).toHaveLength(2);

    const buyerCartView = await cartService.findMine(buyer.id);
    expect(buyerCartView.summary.itemCount).toBe(2);
    expect(buyerCartView.summary.availableItemCount).toBe(2);
    expect(buyerCartView.groups).toHaveLength(2);

    const orderService = new OrderService(
      db,
      new WalletService(db),
      new CodPolicy(db),
    );
    const accepted = await orderService.accept(
      seed.users[2].id,
      seed.shops[0].id,
      seed.orders[0].id,
    );
    expect(accepted.status).toBe(ORDER_STATUS.PREPARING);
    const rejected = await orderService.reject(
      seed.users[3].id,
      seed.shops[1].id,
      seed.orders[1].id,
      { reason: 'Cannot fulfill this item' },
    );
    expect(rejected.status).toBe(ORDER_STATUS.CANCELLED);
    expect(rejected.stockReleaseReviewIds).toEqual([]);
    const released = await db
      .getRepository(Product)
      .findOneByOrFail({ id: seed.orders[1].items[0].productId });
    expect(released.status).toBe(ProductStatus.ACTIVE);
    expect(released.reservedOrderId).toBeNull();
  });
});
