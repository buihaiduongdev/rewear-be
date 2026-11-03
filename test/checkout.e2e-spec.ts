import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Client } from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { createRequestValidationPipe } from '@/common/validation';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { CartService } from '@/modules/cart';
import { Category } from '@/modules/category/entities';
import { CheckoutModule } from '@/modules/checkout/checkout.module';
import { CheckoutService } from '@/modules/checkout/checkout.service';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { MarketplaceFactory } from '@/modules/database/seeds/factories/marketplace.factory';
import { Product, ProductRevision } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { UserAddress } from '@/modules/user-address/entities';
import { User } from '@/modules/user/entities';

const testUrl = process.env.CHECKOUT_TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
suite('Checkout HTTP and PostgreSQL', () => {
  const schema = `checkout_test_${randomUUID().replaceAll('-', '')}`;
  let db: DataSource;
  let admin: Client;
  let app: INestApplication;
  let service: CheckoutService;
  let cart: CartService;
  let factory: MarketplaceFactory;
  let buyer: User;
  let other: User;
  let seller: User;
  let category: Category;
  let address: UserAddress;
  let counter = 0;

  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.pathname !== '/rewear_checkout_test'
    )
      throw new Error('Use dedicated local rewear_checkout_test database');
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
        CheckoutModule,
      ],
      providers: [
        { provide: APP_PIPE, useFactory: createRequestValidationPipe },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        async canActivate(ctx: ExecutionContext) {
          const req = ctx.switchToHttp().getRequest();
          const id = req.headers['x-test-user'];
          if (typeof id !== 'string') throw new UnauthorizedException();
          req.user = await db.manager.findOneBy(User, { id });
          if (!req.user) throw new UnauthorizedException();
          return true;
        },
      })
      .compile();
    service = module.get(CheckoutService);
    cart = module.get(CartService);
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });
  beforeEach(async () => {
    factory = new MarketplaceFactory(`checkout-${counter++}`);
    [buyer, other, seller] = await db
      .getRepository(User)
      .save([
        factory.user(1, 'unused'),
        factory.user(6, 'unused'),
        factory.user(5, 'unused'),
      ]);
    category = await db.getRepository(Category).save(factory.category(0));
    address = await db.getRepository(UserAddress).save({
      userId: buyer.id,
      recipientName: 'Buyer',
      phone: '0912345678',
      addressLine1: 'Test address',
      countryCode: 'VN',
      provinceCode: '79',
      provinceName: 'Ho Chi Minh City',
      wardCode: '26734',
      wardName: 'Test ward',
    });
  });
  afterAll(async () => {
    await app?.close();
    if (db?.isInitialized) await db.destroy();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });
  async function product(index = 0, sellerId = seller.id) {
    const row = await db.getRepository(Product).save(
      factory.product(index, {
        categoryId: category.id,
        sellerUserId: sellerId,
        shopId: null,
      }),
    );
    await db.getRepository(ProductRevision).save({
      productId: row.id,
      revision: row.revision,
      decision: 'APPROVED',
      snapshot: { title: row.title },
      submittedById: seller.id,
      reviewedById: other.id,
      reviewedAt: factory.now,
    });
    return row;
  }
  const input = (ids: string[], addressId = address.id) => ({
    requestId: randomUUID(),
    addressId,
    productIds: ids,
  });

  it('groups sellers, snapshots price/address, and replays without extending the hold', async () => {
    const a = await product();
    const b = await product(1, other.id);
    await cart.add(buyer.id, a.id);
    await cart.add(buyer.id, b.id);
    const body = input([a.id, b.id]);
    const created = await service.create(buyer.id, body);
    expect(created.orders).toHaveLength(2);
    expect(created.status).toBe('HELD');
    expect(
      created.expiresAt!.getTime() - created.createdAt.getTime(),
    ).toBeGreaterThan(598000);
    expect(
      created.orders.every((o) => o.address.recipientName === 'Buyer'),
    ).toBe(true);
    expect(created.paymentReady).toBe(false);
    expect(created.orders.every((o) => o.shippingFee === null)).toBe(true);
    await db.manager.update(UserAddress, address.id, {
      recipientName: 'Changed',
    });
    const repeated = await service.create(buyer.id, body);
    expect(repeated.id).toBe(created.id);
    expect(repeated.expiresAt).toEqual(created.expiresAt);
    expect(repeated.address.recipientName).toBe('Buyer');
    expect(
      (await db.manager.findOneByOrFail(Product, { id: a.id })).reservationId,
    ).toBe(created.id);
  });
  it('serializes duplicate concurrent requests', async () => {
    const p = await product();
    await cart.add(buyer.id, p.id);
    const body = input([p.id]);
    const results = await Promise.all([
      service.create(buyer.id, body),
      service.create(buyer.id, body),
    ]);
    expect(results[0].id).toBe(results[1].id);
  });
  it('allows only one buyer to hold a product', async () => {
    const p = await product();
    await cart.add(buyer.id, p.id);
    await cart.add(other.id, p.id);
    const otherAddress = await db
      .getRepository(UserAddress)
      .save({ ...address, id: randomUUID(), userId: other.id });
    const results = await Promise.all([
      service.create(buyer.id, input([p.id])),
      service.create(other.id, input([p.id], otherAddress.id)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['EMPTY', 'HELD']);
    expect(
      results.find((r) => r.status === 'EMPTY')!.removedItems[0].reason,
    ).toBe('HELD');
  });
  it('cancels idempotently and stale cancellation cannot release a newer hold', async () => {
    const p = await product();
    await cart.add(buyer.id, p.id);
    const first = await service.create(buyer.id, input([p.id]));
    await service.cancel(buyer.id, first.id);
    const next = await service.create(buyer.id, input([p.id]));
    await service.cancel(buyer.id, first.id);
    expect(
      (await db.manager.findOneByOrFail(Product, { id: p.id })).reservationId,
    ).toBe(next.id);
  });
  it('expires and releases only products still belonging to that checkout', async () => {
    const p = await product();
    await cart.add(buyer.id, p.id);
    const created = await service.create(buyer.id, input([p.id]));
    await db.manager.update(Checkout, created.id, { expiresAt: new Date(0) });
    await service.expire();
    await service.expire();
    expect((await service.findMine(buyer.id, created.id)).status).toBe(
      'EXPIRED',
    );
    const row = await db.manager.findOneByOrFail(Product, { id: p.id });
    expect(row.status).toBe(ProductStatus.ACTIVE);
    expect(row.reservationId).toBeNull();
  });
  it('removes unavailable items from this buyer cart without leaking unpublished data', async () => {
    const a = await product();
    const b = await product(1);
    await cart.add(buyer.id, a.id);
    await cart.add(buyer.id, b.id);
    await db.manager.update(Product, b.id, {
      status: ProductStatus.DRAFT,
      title: 'Private draft',
    });
    const result = await service.create(buyer.id, input([a.id, b.id]));
    expect(result.removedItems).toEqual([
      { productId: b.id, reason: 'UNAVAILABLE' },
    ]);
    expect(JSON.stringify(result)).not.toContain('Private draft');
    expect((await cart.findMine(buyer.id)).summary.itemCount).toBe(1);
  });
  it('rejects reused keys with changed payloads and another buyer address', async () => {
    const p = await product();
    await cart.add(buyer.id, p.id);
    const body = input([p.id]);
    await service.create(buyer.id, body);
    await expect(
      service.create(buyer.id, { ...body, productIds: [randomUUID()] }),
    ).rejects.toThrow('different selection');
    await expect(service.create(other.id, input([p.id]))).rejects.toThrow(
      'address not found',
    );
  });
  it('uses the current price at hold time and keeps that snapshot', async () => {
    const p = await product();
    await cart.add(buyer.id, p.id);
    await db.manager.update(Product, p.id, { price: 987654 });
    const result = await service.create(buyer.id, input([p.id]));
    expect(result.orders[0].items[0].price).toBe(987654);
    expect(result.subtotal).toBe(987654);
  });
  it('rejects self purchase on recheck and creates no held order for an empty result', async () => {
    const p = await product();
    await cart.add(buyer.id, p.id);
    await db.manager.update(Product, p.id, { sellerUserId: buyer.id });
    const result = await service.create(buyer.id, input([p.id]));
    expect(result.status).toBe('EMPTY');
    expect(result.orders).toEqual([]);
    expect(result.expiresAt).toBeNull();
    expect(result.removedItems[0].reason).toBe('OWN_PRODUCT');
    expect(
      (await db.manager.findOneByOrFail(Product, { id: p.id })).status,
    ).toBe(ProductStatus.ACTIVE);
  });
  it('enforces HTTP authentication, validation, serialization, and ownership', async () => {
    await request(app.getHttpServer())
      .post('/api/checkouts')
      .send(input([randomUUID()]))
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/checkouts')
      .set('x-test-user', buyer.id)
      .send({ ...input([randomUUID()]), price: 1 })
      .expect(400);
    const p = await product();
    await cart.add(buyer.id, p.id);
    const res = await request(app.getHttpServer())
      .post('/api/checkouts')
      .set('x-test-user', buyer.id)
      .send(input([p.id]))
      .expect(200);
    expect(res.body.data.status).toBe('HELD');
    expect(res.body.data.buyerId).toBeUndefined();
    await request(app.getHttpServer())
      .get(`/api/checkouts/${res.body.data.id}`)
      .set('x-test-user', other.id)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/checkouts/${res.body.data.id}/cancel`)
      .set('x-test-user', other.id)
      .expect(404);
  });
});
