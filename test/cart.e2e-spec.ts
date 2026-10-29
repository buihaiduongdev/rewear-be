import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Client } from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { createRequestValidationPipe } from '@/common/validation';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { CartModule, CartService } from '@/modules/cart';
import { Cart, CartItem } from '@/modules/cart/entities';
import { cartSchema } from '@/modules/cart/schemas/cart.schema';
import { Category } from '@/modules/category/entities';
import { MarketplaceFactory } from '@/modules/database/seeds/factories/marketplace.factory';
import { Media, MediaLink } from '@/modules/media/entities';
import { MediaOwnerType } from '@/modules/media/enums';
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

const testUrl = process.env.CART_TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;

suite('Cart (real HTTP/module/PostgreSQL)', () => {
  const schema = `cart_test_${randomUUID().replaceAll('-', '')}`;
  let db: DataSource;
  let admin: Client;
  let app: INestApplication;
  let service: CartService;
  let factory: MarketplaceFactory;
  let buyer: User;
  let otherBuyer: User;
  let seller: User;
  let owner: User;
  let staff: User;
  let category: Category;
  let shop: Shop;
  let counter = 0;

  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.pathname !== '/rewear_cart_test'
    ) {
      throw new Error(
        'Cart tests require a dedicated local rewear_cart_test database',
      );
    }
    admin = new Client({ connectionString: testUrl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    db = await new DataSource({
      type: 'postgres',
      url: testUrl,
      schema,
      synchronize: true,
      entities: [path.join(__dirname, '../src/modules/**/*.entity.ts')],
    }).initialize();
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRootAsync({
          useFactory: () => db.options,
          dataSourceFactory: async () => db,
        }),
        CartModule,
      ],
      providers: [
        { provide: APP_PIPE, useFactory: createRequestValidationPipe },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        async canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest();
          const id = req.headers['x-test-user'];
          if (typeof id !== 'string') throw new UnauthorizedException();
          const user = await db
            .getRepository(User)
            .findOneBy({ id, status: UserStatus.ACTIVE });
          if (!user) throw new UnauthorizedException();
          req.user = user;
          return true;
        },
      })
      .compile();
    service = module.get(CartService);
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  beforeEach(async () => {
    factory = new MarketplaceFactory(`cart-${counter++}`);
    [buyer, otherBuyer, seller, owner, staff] = await db
      .getRepository(User)
      .save([
        factory.user(1, 'unused'),
        factory.user(6, 'unused'),
        factory.user(5, 'unused'),
        factory.user(2, 'unused'),
        factory.user(3, 'unused'),
      ]);
    category = await db.getRepository(Category).save(factory.category(0));
    shop = await db.getRepository(Shop).save(factory.shop(0));
    await db.getRepository(ShopMember).save([
      factory.shopMember(0, shop.id, owner.id),
      factory.shopMember(1, shop.id, staff.id, {
        memberRole: ShopMemberRole.STAFF,
      }),
    ]);
  });

  afterAll(async () => {
    await app?.close();
    if (db?.isInitialized) await db.destroy();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });

  async function product(
    index = 0,
    shopSource = false,
    overrides: Partial<Product> = {},
  ) {
    const row = await db.getRepository(Product).save(
      factory.product(
        index,
        shopSource
          ? { categoryId: category.id, shopId: shop.id, sellerUserId: null }
          : {
              categoryId: category.id,
              shopId: null,
              sellerUserId: seller.id,
            },
        overrides,
      ),
    );
    const image = await db
      .getRepository(Media)
      .save(factory.media(index, 0, shopSource ? owner.id : seller.id));
    const revision = await db.getRepository(ProductRevision).save({
      productId: row.id,
      revision: row.revision,
      decision: 'APPROVED',
      snapshot: { title: row.title },
      submittedById: seller.id,
      reviewedById: owner.id,
      reviewedAt: factory.now,
    });
    await db.getRepository(MediaLink).save(
      factory.mediaLink(index, 0, {
        ownerType: MediaOwnerType.PRODUCT_REVISION,
        ownerId: revision.id,
        mediaId: image.id,
      }),
    );
    return row;
  }
  function items(view: Awaited<ReturnType<CartService['findMine']>>) {
    return view.groups.flatMap((group) => group.items);
  }

  it('requires authentication and returns an empty cart without creating a row', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/cart').expect(401);
    await request(server)
      .put(`/api/cart/items/${randomUUID()}`)
      .send({})
      .expect(401);
    await request(server).delete(`/api/cart/items/${randomUUID()}`).expect(401);
    const res = await request(server)
      .get('/api/cart')
      .set('x-test-user', buyer.id)
      .expect(200);
    expect(res.body.data).toEqual({
      groups: [],
      summary: {
        itemCount: 0,
        availableItemCount: 0,
        totalPrice: 0,
        currency: 'VND',
      },
    });
    expect(await db.getRepository(Cart).existsBy({ userId: buyer.id })).toBe(
      false,
    );
  });

  it('adds through PUT, returns ISO dates and keeps duplicate retries idempotent', async () => {
    const row = await product();
    const server = app.getHttpServer();
    const first = await request(server)
      .put(`/api/cart/items/${row.id}`)
      .set('x-test-user', buyer.id)
      .expect(200);
    const second = await request(server)
      .put(`/api/cart/items/${row.id}`)
      .set('x-test-user', buyer.id)
      .send({})
      .expect(200);
    expect(second.body.data).toEqual(first.body.data);
    expect(first.body.data.summary).toMatchObject({
      itemCount: 1,
      availableItemCount: 1,
      totalPrice: row.price,
    });
    const item = first.body.data.groups[0].items[0];
    expect(item.addedAt).toEqual(expect.any(String));
    expect(item.product.coverUrl).toMatch(/^https:/);
    expect(item).not.toHaveProperty('quantity');
    expect(item.product).not.toHaveProperty('storageKey');
    expect(
      (await db.getRepository(Product).findOneByOrFail({ id: row.id })).status,
    ).toBe(ProductStatus.ACTIVE);
    expect(
      (await db.getRepository(Product).findOneByOrFail({ id: row.id }))
        .heldUntil,
    ).toBeNull();
  });

  it.each([
    { quantity: 2 },
    { userId: 'spoofed' },
    { cartId: 'spoofed' },
    { price: 1 },
  ])('rejects writable fields %j', async (body) => {
    const row = await product();
    await request(app.getHttpServer())
      .put(`/api/cart/items/${row.id}`)
      .set('x-test-user', buyer.id)
      .send(body)
      .expect(400);
    expect((await service.findMine(buyer.id)).summary.itemCount).toBe(0);
  });

  it('validates product IDs and does not create a cart for a missing listing', async () => {
    const server = app.getHttpServer();
    await request(server)
      .put('/api/cart/items/not-a-uuid')
      .set('x-test-user', buyer.id)
      .send({})
      .expect(400);
    await request(server)
      .delete('/api/cart/items/not-a-uuid')
      .set('x-test-user', buyer.id)
      .expect(400);
    await request(server)
      .put(`/api/cart/items/${randomUUID()}`)
      .set('x-test-user', buyer.id)
      .send({})
      .expect(404);
    expect(await db.getRepository(Cart).existsBy({ userId: buyer.id })).toBe(
      false,
    );
  });

  it('serializes simultaneous first additions into one cart and one item per product', async () => {
    const first = await product();
    const second = await product(1);
    await Promise.all([
      service.add(buyer.id, first.id),
      service.add(buyer.id, first.id),
      service.add(buyer.id, second.id),
      service.add(buyer.id, second.id),
    ]);
    const cart = await db
      .getRepository(Cart)
      .findOneByOrFail({ userId: buyer.id });
    expect(await db.getRepository(Cart).countBy({ userId: buyer.id })).toBe(1);
    expect(await db.getRepository(CartItem).countBy({ cartId: cart.id })).toBe(
      2,
    );
  });

  it('allows two buyers to save the same listing without reserving it', async () => {
    const row = await product();
    await Promise.all([
      service.add(buyer.id, row.id),
      service.add(otherBuyer.id, row.id),
    ]);
    expect((await service.findMine(buyer.id)).summary.itemCount).toBe(1);
    expect((await service.findMine(otherBuyer.id)).summary.itemCount).toBe(1);
    const after = await db
      .getRepository(Product)
      .findOneByOrFail({ id: row.id });
    expect(after.status).toBe(ProductStatus.ACTIVE);
    expect(after.heldUntil).toBeNull();
  });

  it('blocks a personal seller or active shop owner from adding their own listing', async () => {
    const personal = await product();
    const shopProduct = await product(1, true);
    await expect(service.add(seller.id, personal.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.add(owner.id, shopProduct.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // Existing policy blocks owners; staff buying is not newly restricted.
    expect(
      (await service.add(staff.id, shopProduct.id)).summary.availableItemCount,
    ).toBe(1);
  });

  it('groups sources separately and recomputes current prices without changing addedAt', async () => {
    const first = await product();
    const sameSeller = await product(1);
    const shopProduct = await product(2, true);
    await service.add(buyer.id, first.id);
    await service.add(buyer.id, sameSeller.id);
    await service.add(buyer.id, shopProduct.id);
    const before = await service.findMine(buyer.id);
    const addedAt = items(before).find(
      (item) => item.productId === first.id,
    )!.addedAt;
    await db.getRepository(Product).update(first.id, { price: 700000 });
    const after = await service.findMine(buyer.id);
    expect(after.groups).toHaveLength(2);
    expect(
      after.groups.find((group) => group.source?.type === 'USER')?.items,
    ).toHaveLength(2);
    expect(after.summary.totalPrice).toBe(
      700000 + sameSeller.price! + shopProduct.price!,
    );
    expect(
      items(after).find((item) => item.productId === first.id)?.addedAt,
    ).toEqual(addedAt);
    expect(() => cartSchema.parse(after)).not.toThrow();
  });

  it.each([ProductStatus.HELD, ProductStatus.SOLD])(
    'reports %s without deleting the saved item or counting its price',
    async (status) => {
      const row = await product();
      await service.add(buyer.id, row.id);
      await db.getRepository(Product).update(row.id, { status });
      const view = await service.findMine(buyer.id);
      expect(items(view)[0]).toMatchObject({
        productId: row.id,
        availability: status,
        product: { title: row.title },
      });
      expect(view.summary).toMatchObject({
        itemCount: 1,
        availableItemCount: 0,
        totalPrice: 0,
      });
      await expect(service.add(buyer.id, row.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    },
  );

  it.each([
    ProductStatus.DRAFT,
    ProductStatus.PENDING_REVIEW,
    ProductStatus.REJECTED,
    ProductStatus.HIDDEN,
    ProductStatus.SUSPENDED,
  ])(
    'does not expose unpublished content when a saved product becomes %s',
    async (status) => {
      const row = await product();
      await service.add(buyer.id, row.id);
      await db
        .getRepository(Product)
        .update(row.id, { status, title: 'PRIVATE UNREVIEWED TITLE' });
      const view = await service.findMine(buyer.id);
      expect(view.groups[0].source).toBeNull();
      expect(items(view)[0].product).toBeNull();
      expect(items(view)[0].availability).toBe('UNAVAILABLE');
      expect(JSON.stringify(view)).not.toContain('PRIVATE UNREVIEWED TITLE');
      expect(view.summary.availableItemCount).toBe(0);
      await expect(service.add(buyer.id, row.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    },
  );

  it('requires matching approved revision and active category, seller and shop', async () => {
    const first = await product();
    const second = await product(1, true);
    await service.add(buyer.id, first.id);
    await service.add(buyer.id, second.id);
    await db.getRepository(Product).update(first.id, { revision: 2 });
    await db
      .getRepository(Shop)
      .update(shop.id, { status: ShopStatus.INACTIVE });
    expect(
      items(await service.findMine(buyer.id)).every(
        (item) => item.availability === 'UNAVAILABLE',
      ),
    ).toBe(true);
    await expect(service.add(otherBuyer.id, first.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.add(otherBuyer.id, second.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await db.getRepository(Product).update(first.id, { revision: 1 });
    await db.getRepository(Category).update(category.id, { isActive: false });
    await expect(service.add(otherBuyer.id, first.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await db.getRepository(Category).update(category.id, { isActive: true });
    await db
      .getRepository(User)
      .update(seller.id, { status: UserStatus.INACTIVE });
    await expect(service.add(otherBuyer.id, first.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('does not trust approval fields without an approved revision record', async () => {
    const row = await product();
    await service.add(buyer.id, row.id);
    await db.getRepository(ProductRevision).delete({ productId: row.id });
    const view = await service.findMine(buyer.id);
    expect(items(view)[0]).toMatchObject({
      availability: 'UNAVAILABLE',
      product: null,
    });
    expect(view.summary.totalPrice).toBe(0);
    await expect(service.add(otherBuyer.id, row.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rechecks shop ownership acquired after adding an item', async () => {
    const row = await product(0, true);
    await service.add(buyer.id, row.id);
    await db
      .getRepository(ShopMember)
      .update(
        { shopId: shop.id, userId: owner.id },
        { status: ShopMemberStatus.INACTIVE },
      );
    await db.getRepository(ShopMember).save({
      shopId: shop.id,
      userId: buyer.id,
      memberRole: ShopMemberRole.OWNER,
      status: ShopMemberStatus.ACTIVE,
    });
    const view = await service.findMine(buyer.id);
    expect(items(view)[0].availability).toBe('OWN_PRODUCT');
    expect(view.summary.availableItemCount).toBe(0);
  });

  it('scopes removals to the current user, supports unavailable items and repeated DELETE', async () => {
    const row = await product();
    await service.add(buyer.id, row.id);
    const server = app.getHttpServer();
    await request(server)
      .delete(`/api/cart/items/${row.id}`)
      .set('x-test-user', otherBuyer.id)
      .expect(204);
    expect((await service.findMine(buyer.id)).summary.itemCount).toBe(1);
    await db
      .getRepository(Product)
      .update(row.id, { status: ProductStatus.SOLD });
    const deleted = await request(server)
      .delete(`/api/cart/items/${row.id}`)
      .set('x-test-user', buyer.id)
      .expect(204);
    expect(deleted.text).toBe('');
    await request(server)
      .delete(`/api/cart/items/${row.id}`)
      .set('x-test-user', buyer.id)
      .expect(204);
    expect((await service.findMine(buyer.id)).summary.itemCount).toBe(0);
  });

  it('waits for a concurrent product change then rejects an unavailable listing', async () => {
    const row = await product();
    let release!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writer = db.transaction(async (manager) => {
      const changing = await manager.findOneOrFail(Product, {
        where: { id: row.id },
        lock: { mode: 'pessimistic_write' },
      });
      changing.status = ProductStatus.HELD;
      await manager.save(changing);
      locked();
      await gate;
    });
    await ready;
    const addition = service.add(buyer.id, row.id);
    release();
    await writer;
    await expect(addition).rejects.toBeInstanceOf(ConflictException);
    expect((await service.findMine(buyer.id)).summary.itemCount).toBe(0);
  });

  it('documents JWT, no quantity/body fields and the grouped response in OpenAPI', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Cart contract').addBearerAuth().build(),
    );
    const route = doc.paths['/api/cart/items/{productId}'];
    expect(route.put?.security).toEqual([{ bearer: [] }]);
    expect(route.delete?.responses).toHaveProperty('204');
    const body = (route.put!.requestBody as any).content['application/json']
      .schema;
    expect(body.additionalProperties).toBe(false);
    expect(body.properties).toEqual({});
    if (process.env.CART_OPENAPI_OUTPUT)
      writeFileSync(
        process.env.CART_OPENAPI_OUTPUT,
        JSON.stringify(doc, null, 2),
      );
  });
});
