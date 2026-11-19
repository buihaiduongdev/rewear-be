import * as argon2 from 'argon2';
import type { DataSource } from 'typeorm';

import { DEFAULT_SEED_PASSWORD } from '@/database/seeds/catalog';
import { runInitialDataSeed } from '@/database/seeds/initial-data.seed';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { CartService } from '@/modules/cart/cart.service';
import { Cart, CartItem } from '@/modules/cart/entities';
import { Category } from '@/modules/category/entities';
import { MediaLink } from '@/modules/media/entities';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { ProductService } from '@/modules/product/product.service';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { UserAddress } from '@/modules/user-address/entities';
import { User } from '@/modules/user/entities';

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
    expect(seed.userAddresses).toHaveLength(8);
    expect(seed.pickupLocations).toHaveLength(3);
    expect(seed.cartItems).toHaveLength(5);
    expect(await db.getRepository(UserAddress).count()).toBe(8);
    expect(await db.getRepository(PickupLocation).count()).toBe(3);
    expect(await db.getRepository(Cart).count()).toBe(2);
    expect(await db.getRepository(CartItem).count()).toBe(5);
    expect(await db.getRepository(MediaLink).count()).toBe(108);
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
          product.mediaCount === 3 &&
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
  });
});
