import { randomUUID } from 'node:crypto';

import * as argon2 from 'argon2';
import { QueryFailedError } from 'typeorm';
import type { DataSource } from 'typeorm';

import { Category } from '@/modules/category/entities';
import { DEFAULT_SEED_PASSWORD } from '@/modules/database/seeds/catalog';
import { MarketplaceFactory } from '@/modules/database/seeds/factories/marketplace.factory';
import { seedMarketplace } from '@/modules/database/seeds/marketplace.seed';
import { Media, MediaLink } from '@/modules/media/entities';
import { MediaOwnerType } from '@/modules/media/enums';
import { Product, ProductRevision } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { ProductService } from '@/modules/product/product.service';
import { productSchema } from '@/modules/product/schemas';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { UserService } from '@/modules/user/user.service';

import type { TestDatabase } from '../support/database';
import { createTestDatabase } from '../support/database';

describe('Seed data (real PostgreSQL)', () => {
  let database: TestDatabase;
  let db: DataSource;

  beforeAll(async () => {
    database = await createTestDatabase();
    db = database.dataSource;
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it('creates usable public inventory, management states, media and review evidence', async () => {
    const manifest = await seedMarketplace(db);
    expect(manifest.counts).toEqual({
      users: 7,
      categories: 6,
      shops: 3,
      members: 3,
      products: 36,
      activeProducts: 30,
      media: 108,
      revisions: 35,
      mediaLinks: 213,
    });
    expect(await db.getRepository(Product).count()).toBe(36);
    expect(await db.getRepository(Media).count()).toBe(108);
    expect(await db.getRepository(MediaLink).count()).toBe(213);
    expect(await db.getRepository(ProductRevision).count()).toBe(35);
    const buyer = await db.getRepository(User).findOneOrFail({
      where: { id: manifest.accounts[1].id },
      select: { id: true, password: true },
    });
    expect(await argon2.verify(buyer.password!, DEFAULT_SEED_PASSWORD)).toBe(
      true,
    );
    const service = new ProductService(
      db.getRepository(Product),
      db.getRepository(Category),
      db.getRepository(Shop),
      db.getRepository(ShopMember),
      db,
    );
    const result = await service.findAll({ path: '/products', limit: 100 });
    expect(result.meta.totalItems).toBe(30);
    for (const product of result.data) {
      expect(product.status).toBe(ProductStatus.ACTIVE);
      expect(product.coverUrl).toMatch(/^https:\/\/images\.unsplash\.com\//);
      expect(product.mediaCount).toBe(3);
      expect(() => productSchema.parse(product)).not.toThrow();
    }
    const categoryId = result.data[0].categoryId!;
    const filtered = await service.findAll({
      path: '/products',
      limit: 2,
      sortBy: [['price', 'ASC']],
      filter: { categoryId: `$eq:${categoryId}`, price: '$gte:0' },
    });
    expect(filtered.data).toHaveLength(2);
    expect(
      filtered.data.every((product) => product.categoryId === categoryId),
    ).toBe(true);
    expect(filtered.data[0].price!).toBeLessThanOrEqual(
      filtered.data[1].price!,
    );
    expect(filtered.meta.itemsPerPage).toBe(2);
    expect(filtered.links.current).toContain('limit=2');

    const users = await new UserService(db.getRepository(User)).findAll({
      path: '/users',
      search: 'Minh Anh',
      filter: { role: '$eq:USER' },
    });
    expect(users.data.map((user) => user.fullName)).toEqual(['Minh Anh']);

    const draft = await db
      .getRepository(Product)
      .findOneByOrFail({ status: ProductStatus.DRAFT });
    expect(draft.title).toBeNull();
    expect(draft.price).toBeNull();
    expect(
      await db
        .getRepository(MediaLink)
        .countBy({ ownerType: MediaOwnerType.PRODUCT, ownerId: draft.id }),
    ).toBe(3);
  });

  it('is safe to repeat and preserves existing edits and unrelated data', async () => {
    const factory = new MarketplaceFactory();
    const productId = factory.id('product:0');
    await db
      .getRepository(Product)
      .update(productId, { title: 'Changed during E2E' });
    const unrelated = await db.getRepository(User).save(
      factory.user(1, 'not-a-login-hash', {
        id: randomUUID(),
        email: 'unrelated@seed.rewear.test',
      }),
    );
    await Promise.all([seedMarketplace(db), seedMarketplace(db)]);
    expect(await db.getRepository(Product).count()).toBe(36);
    expect(await db.getRepository(MediaLink).count()).toBe(213);
    expect(
      (await db.getRepository(Product).findOneByOrFail({ id: productId }))
        .title,
    ).toBe('Changed during E2E');
    expect(await db.getRepository(User).existsBy({ id: unrelated.id })).toBe(
      true,
    );
  });

  it('rolls back the entire seed when a conflicting account prevents valid ownership', async () => {
    const factory = new MarketplaceFactory('rollback');
    await db
      .getRepository(User)
      .save(factory.user(2, 'not-a-login-hash', { id: randomUUID() }));
    const usersBefore = await db.getRepository(User).count();
    await expect(
      seedMarketplace(db, { namespace: 'rollback' }),
    ).rejects.toBeInstanceOf(QueryFailedError);
    expect(await db.getRepository(User).count()).toBe(usersBefore);
    expect(
      await db
        .getRepository(Category)
        .existsBy({ id: factory.id('category:0') }),
    ).toBe(false);
    expect(
      await db.getRepository(Shop).existsBy({ id: factory.id('shop:0') }),
    ).toBe(false);
  });

  it('lets the real moderation service approve the seeded pending submission', async () => {
    const factory = new MarketplaceFactory();
    const pending = await db
      .getRepository(Product)
      .findOneByOrFail({ status: ProductStatus.PENDING_REVIEW });
    const service = new ProductService(
      db.getRepository(Product),
      db.getRepository(Category),
      db.getRepository(Shop),
      db.getRepository(ShopMember),
      db,
    );
    await service.moderate(pending.id, factory.id('user:0'), {
      revision: 1,
      decision: 'APPROVE',
    });
    const published = await service.findOne(pending.id);
    expect(published.status).toBe(ProductStatus.ACTIVE);
    expect(published.approvedRevision).toBe(1);
    expect(published.mediaCount).toBe(3);
  });
});
