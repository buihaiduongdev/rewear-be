import { randomUUID } from 'node:crypto';

import { Category } from '@/modules/category/entities';
import { Media, MediaLink } from '@/modules/media/entities';
import { MediaOwnerType, MediaRole, MediaType } from '@/modules/media/enums';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { ShopFollow } from '@/modules/shop-follows/entities/shop-follow.entity';
import { ShopFollowFeedService } from '@/modules/shop-follows/shop-follow-feed.service';
import { ShopFollowService } from '@/modules/shop-follows/shop-follow.service';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserStatus } from '@/modules/user/enums';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Follow Shop PostgreSQL', () => {
  let database: TestDatabase;
  let service: ShopFollowService;
  let feed: ShopFollowFeedService;
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new ShopFollowService(database.dataSource);
    feed = new ShopFollowFeedService(database.dataSource);
  });
  afterAll(async () => database?.destroy());
  it('cleans follows when a Shop is deleted and safely handles missing targets', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const shop = await db.manager.save(
      Shop,
      db.manager.create(Shop, { name: 'Temporary Shop' }),
    );
    await service.follow(f.buyer.id, shop.id);
    await db.manager.delete(Shop, shop.id);
    expect(
      await db.manager.countBy(ShopFollow, {
        userId: f.buyer.id,
        shopId: shop.id,
      }),
    ).toBe(0);
    await expect(service.state(f.buyer.id, shop.id)).rejects.toThrow(
      'Active Shop not found',
    );
    expect(await service.unfollow(f.buyer.id, shop.id)).toEqual({
      shopId: shop.id,
      following: false,
      followedAt: null,
    });
    await expect(service.follow(f.buyer.id, randomUUID())).rejects.toThrow(
      'Active Shop not found',
    );
  });
  it('paginates tied publications consistently and returns only current public cover metadata', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    await service.follow(f.buyer.id, f.shop.id);
    const category = await db.manager.save(
      Category,
      db.manager.create(Category, {
        name: 'Feed category',
        slug: randomUUID(),
        isActive: true,
      }),
    );
    const publishedAt = new Date(Date.now() - 1000);
    const products = [];
    for (let i = 0; i < 3; i++) {
      const product = await db.manager.save(
        Product,
        db.manager.create(Product, {
          shopId: f.shop.id,
          categoryId: category.id,
          title: `Jacket ${i}`,
          price: 100000,
          status: ProductStatus.ACTIVE,
          publishedAt,
        }),
      );
      await db.manager.save(
        ProductModeration,
        db.manager.create(ProductModeration, {
          productId: product.id,
          status: ProductModerationStatus.APPROVED,
          version: 1,
        }),
      );
      products.push(product);
    }
    products.sort((a, b) => b.id.localeCompare(a.id));
    const cover = await db.manager.save(
      Media,
      db.manager.create(Media, {
        uploadedById: f.owner.id,
        storageKey: randomUUID(),
        url: 'https://public.test/cover.jpg',
        mediaType: MediaType.IMAGE,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        retiredAt: null,
      }),
    );
    await db.manager.save(
      MediaLink,
      db.manager.create(MediaLink, {
        mediaId: cover.id,
        ownerType: MediaOwnerType.PRODUCT,
        ownerId: products[0].id,
        role: MediaRole.COVER,
        sortOrder: 0,
      }),
    );
    const first = await feed.products(f.buyer.id, { limit: 1, offset: 0 });
    const second = await feed.products(f.buyer.id, { limit: 1, offset: 1 });
    expect(first.totalCount).toBe(3);
    expect(first.items[0].id).toBe(products[0].id);
    expect(second.items[0].id).toBe(products[1].id);
    expect(first.items[0].coverUrl).toBe('https://public.test/cover.jpg');
    expect(JSON.stringify(first)).not.toContain('storageKey');
    await db.manager.update(Media, cover.id, { retiredAt: new Date() });
    expect(
      (await feed.products(f.buyer.id, { limit: 1, offset: 0 })).items[0]
        .coverUrl,
    ).toBeNull();
    await db.manager.update(Product, products[0].id, {
      publishedAt: new Date(Date.now() + 60000),
    });
    expect(
      (await feed.products(f.buyer.id, { limit: 50, offset: 0 })).items.map(
        (row) => row.id,
      ),
    ).not.toContain(products[0].id);
  });
  it('follows once concurrently, preserves original time and scopes state/list/remove to actor', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const other = await adjudicationFixture(db);
    const [a, b] = await Promise.all([
      service.follow(f.buyer.id, f.shop.id),
      service.follow(f.buyer.id, f.shop.id),
    ]);
    expect(a).toEqual(b);
    expect(a.following).toBe(true);
    expect(
      await db.manager.countBy(ShopFollow, {
        userId: f.buyer.id,
        shopId: f.shop.id,
      }),
    ).toBe(1);
    expect(
      (await service.list(other.buyer.id, { limit: 50, offset: 0 })).totalCount,
    ).toBe(0);
    await service.unfollow(other.buyer.id, f.shop.id);
    expect((await service.state(f.buyer.id, f.shop.id)).following).toBe(true);
    await service.unfollow(f.buyer.id, f.shop.id);
    await service.unfollow(f.buyer.id, f.shop.id);
    expect((await service.state(f.buyer.id, f.shop.id)).following).toBe(false);
  });
  it('keeps followed inactive Shops removable, rejects a new inactive follow and denies inactive accounts', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const other = await adjudicationFixture(db);
    const first = await service.follow(f.buyer.id, f.shop.id);
    await db.manager.update(Shop, f.shop.id, { status: ShopStatus.INACTIVE });
    expect(await service.follow(f.buyer.id, f.shop.id)).toEqual(first);
    expect(
      (await service.list(f.buyer.id, { limit: 50, offset: 0 })).items[0].shop
        .status,
    ).toBe('INACTIVE');
    await expect(service.follow(other.buyer.id, f.shop.id)).rejects.toThrow(
      'Active Shop not found',
    );
    await service.unfollow(f.buyer.id, f.shop.id);
    await db.manager.update(User, other.buyer.id, {
      status: UserStatus.INACTIVE,
    });
    await expect(
      service.list(other.buyer.id, { limit: 50, offset: 0 }),
    ).rejects.toThrow('Active account required');
    await expect(
      feed.products(other.buyer.id, { limit: 50, offset: 0 }),
    ).rejects.toThrow('Active account required');
  });
  it('returns only current public products of currently followed active Shops', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const other = await adjudicationFixture(db);
    await service.follow(f.buyer.id, f.shop.id);
    const category = await db.manager.save(
      Category,
      db.manager.create(Category, {
        name: 'Follow category',
        slug: randomUUID(),
        isActive: true,
      }),
    );
    const product = await db.manager.save(
      Product,
      db.manager.create(Product, {
        shopId: f.shop.id,
        categoryId: category.id,
        title: 'Public jacket',
        price: 200000,
        status: ProductStatus.ACTIVE,
        publishedAt: new Date(Date.now() - 1000),
      }),
    );
    const moderation = await db.manager.save(
      ProductModeration,
      db.manager.create(ProductModeration, {
        productId: product.id,
        status: ProductModerationStatus.APPROVED,
        version: 1,
        reason: null,
      }),
    );
    expect(
      (await feed.products(f.buyer.id, { limit: 50, offset: 0 })).items.map(
        (row) => row.id,
      ),
    ).toEqual([product.id]);
    expect(
      (await feed.products(other.buyer.id, { limit: 50, offset: 0 })).items,
    ).toHaveLength(0);
    await db.manager.update(ProductModeration, moderation.id, {
      status: ProductModerationStatus.PENDING,
    });
    expect(
      (await feed.products(f.buyer.id, { limit: 50, offset: 0 })).items,
    ).toHaveLength(0);
    await db.manager.update(ProductModeration, moderation.id, {
      status: ProductModerationStatus.APPROVED,
    });
    await db.manager.update(Category, category.id, { isActive: false });
    expect(
      (await feed.products(f.buyer.id, { limit: 50, offset: 0 })).items,
    ).toHaveLength(0);
    await db.manager.update(Category, category.id, { isActive: true });
    await db.manager.update(Shop, f.shop.id, { status: ShopStatus.INACTIVE });
    expect(
      (await feed.products(f.buyer.id, { limit: 50, offset: 0 })).items,
    ).toHaveLength(0);
    await db.manager.update(Shop, f.shop.id, { status: ShopStatus.ACTIVE });
    await service.unfollow(f.buyer.id, f.shop.id);
    expect(
      (await feed.products(f.buyer.id, { limit: 50, offset: 0 })).items,
    ).toHaveLength(0);
  });
});
