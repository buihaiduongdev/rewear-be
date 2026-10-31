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
import { GhnSandboxAdapter } from '@/infrastructure/shipping/ghn-sandbox.adapter';
import type { CarrierQuoteInput } from '@/infrastructure/shipping/ghn-sandbox.adapter';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { CartService } from '@/modules/cart';
import { Category } from '@/modules/category/entities';
import { CheckoutModule } from '@/modules/checkout/checkout.module';
import { CheckoutService } from '@/modules/checkout/checkout.service';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { CheckoutShippingQuote } from '@/modules/checkout/entities/shipping-quote.entity';
import { ShippingQuoteService } from '@/modules/checkout/shipping-quote.service';
import { MarketplaceFactory } from '@/modules/database/seeds/factories/marketplace.factory';
import { Product, ProductRevision } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
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
  let quotes: ShippingQuoteService;
  let quoteBehavior: (
    input: CarrierQuoteInput,
    signal: AbortSignal,
  ) => Promise<{ fee: number; estimatedDeliveryAt: string | null }>;
  const carrier = {
    quote: (input: CarrierQuoteInput, signal: AbortSignal) =>
      quoteBehavior(input, signal),
  };
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
      .overrideProvider(GhnSandboxAdapter)
      .useValue(carrier)
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
    quotes = module.get(ShippingQuoteService);
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });
  beforeEach(async () => {
    quoteBehavior = async () => ({ fee: 25000, estimatedDeliveryAt: null });
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
  async function product(
    index = 0,
    sellerId = seller.id,
    overrides: Partial<Product> = {},
  ) {
    const row = await db.getRepository(Product).save(
      factory.product(
        index,
        {
          categoryId: category.id,
          sellerUserId: sellerId,
          shopId: null,
        },
        overrides,
      ),
    );
    await db.getRepository(ProductRevision).save({
      productId: row.id,
      revision: row.revision,
      decision: 'APPROVED',
      snapshot: {
        title: row.title,
        shippingPackage: row.shippingPackage ?? null,
      },
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
  async function quoteReady(otherSource = false) {
    const a = await product(0, seller.id, {
      shippingPackage: {
        weight: { mode: 'CUSTOM', grams: 300 },
        size: { mode: 'CUSTOM', lengthCm: 20, widthCm: 15, heightCm: 10 },
      },
    });
    const b = await product(1, otherSource ? other.id : seller.id, {
      shippingPackage: {
        weight: { mode: 'CUSTOM', grams: 500 },
        size: { mode: 'CUSTOM', lengthCm: 30, widthCm: 20, heightCm: 15 },
      },
    });
    await cart.add(buyer.id, a.id);
    await cart.add(buyer.id, b.id);
    const pickup = await db.manager.save(PickupLocation, {
      userId: seller.id,
      shopId: null,
      contactName: 'Private pickup contact',
      phone: '0999999999',
      addressLine1: 'Private pickup street',
      countryCode: 'VN',
      provinceCode: '79',
      provinceName: 'Ho Chi Minh City',
      wardCode: '26734',
      wardName: 'Test ward',
    });
    if (otherSource)
      await db.manager.save(PickupLocation, {
        userId: other.id,
        shopId: null,
        contactName: 'Other pickup',
        phone: '0999999998',
        addressLine1: 'Other private street',
        countryCode: 'VN',
        provinceCode: '79',
        provinceName: 'Ho Chi Minh City',
        wardCode: '26734',
        wardName: 'Test ward',
      });
    return {
      held: await service.create(buyer.id, input([a.id, b.id])),
      pickup,
    };
  }
  function providerGate() {
    let started!: () => void;
    let finish!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    quoteBehavior = async (_input, signal) => {
      started();
      await Promise.race([
        gate,
        new Promise<void>((_resolve, reject) =>
          signal.addEventListener(
            'abort',
            () => reject(new Error('CARRIER_UNAVAILABLE')),
            { once: true },
          ),
        ),
      ]);
      return { fee: 25000, estimatedDeliveryAt: null };
    };
    return { entered, finish };
  }
  it('quotes one combined parcel, persists it privately and reuses a fresh result', async () => {
    const { held } = await quoteReady();
    let sent: CarrierQuoteInput | undefined;
    quoteBehavior = async (data) => {
      sent = data;
      return { fee: 25000, estimatedDeliveryAt: null };
    };
    const response = await request(app.getHttpServer())
      .post(`/api/checkouts/${held.id}/shipping-quotes`)
      .set('x-test-user', buyer.id)
      .send({})
      .expect(200);
    const result = response.body.data;
    expect(result.status).toBe('READY');
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].parcel).toEqual({
      weightGrams: 800,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 25,
    });
    expect(result.orders[0].parcelCount).toBe(1);
    expect(result.orders[0].itemCount).toBe(2);
    expect(result.totalShippingFee).toBe(25000);
    expect(result.grandTotal).toBe(held.subtotal + 25000);
    expect(result.environment).toBe('SANDBOX');
    expect(result.paymentReady).toBe(false);
    expect(sent?.from.addressLine1).toBe('Private pickup street');
    expect(JSON.stringify(result)).not.toContain('Private pickup');
    expect((await quotes.refresh(buyer.id, held.id)).id).toBe(result.id);
    const read = await service.findMine(buyer.id, held.id);
    expect(read.shippingQuote?.id).toBe(result.id);
    expect(read.expiresAt).toEqual(held.expiresAt);
  });
  it('enforces buyer auth, ownership, strict quote input and active reservation', async () => {
    const { held } = await quoteReady();
    const path = `/api/checkouts/${held.id}/shipping-quotes`;
    await request(app.getHttpServer()).post(path).send({}).expect(401);
    await request(app.getHttpServer())
      .post(path)
      .set('x-test-user', other.id)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post(path)
      .set('x-test-user', buyer.id)
      .send({ shippingFee: 0 })
      .expect(400);
    await service.cancel(buyer.id, held.id);
    await request(app.getHttpServer())
      .post(path)
      .set('x-test-user', buyer.id)
      .send({})
      .expect(409);
  });
  it('invalidates a saved estimate after pickup changes without exposing the address', async () => {
    const { held, pickup } = await quoteReady();
    const first = await quotes.refresh(buyer.id, held.id);
    await db.manager.update(PickupLocation, pickup.id, {
      addressLine1: 'New private pickup street',
    });
    const read = await service.findMine(buyer.id, held.id);
    expect(read.shippingQuote?.status).toBe('INVALIDATED');
    expect(read.shippingQuote?.totalShippingFee).toBeNull();
    expect(JSON.stringify(read)).not.toContain('private pickup street');
    expect((await quotes.refresh(buyer.id, held.id)).id).not.toBe(first.id);
  });
  it('allows cancellation during provider HTTP and discards the in-flight fee', async () => {
    const { held } = await quoteReady();
    const gate = providerGate();
    const pending = quotes.refresh(buyer.id, held.id);
    await gate.entered;
    try {
      expect((await service.cancel(buyer.id, held.id)).status).toBe(
        'CANCELLED',
      );
    } finally {
      gate.finish();
    }
    const result = await pending;
    expect(result.status).toBe('INVALIDATED');
    expect(result.grandTotal).toBeNull();
    expect(result.orders[0].fee).toBeNull();
  });
  it('expires an in-flight quote when the hold deadline passes', async () => {
    const { held } = await quoteReady();
    const gate = providerGate();
    const pending = quotes.refresh(buyer.id, held.id);
    await gate.entered;
    await db.manager.update(Checkout, held.id, {
      expiresAt: new Date(Date.now() - 1000),
    });
    gate.finish();
    expect((await pending).status).toBe('EXPIRED');
    expect((await service.findMine(buyer.id, held.id)).status).toBe('EXPIRED');
  });
  it('keeps the latest refresh when a changed pickup supersedes a slow request', async () => {
    const { held, pickup } = await quoteReady();
    const gate = providerGate();
    const first = quotes.refresh(buyer.id, held.id);
    await gate.entered;
    await db.manager.update(PickupLocation, pickup.id, {
      addressLine1: 'Updated street',
    });
    quoteBehavior = async () => ({ fee: 30000, estimatedDeliveryAt: null });
    const latest = await quotes.refresh(buyer.id, held.id);
    gate.finish();
    expect((await first).status).toBe('INVALIDATED');
    const read = await service.findMine(buyer.id, held.id);
    expect(read.shippingQuote?.id).toBe(latest.id);
    expect(read.shippingQuote?.totalShippingFee).toBe(30000);
  });
  it('reuses an identical pending request instead of contacting the provider twice', async () => {
    const { held } = await quoteReady();
    const gate = providerGate();
    const first = quotes.refresh(buyer.id, held.id);
    await gate.entered;
    const repeated = await quotes.refresh(buyer.id, held.id);
    expect(repeated.status).toBe('FETCHING');
    gate.finish();
    expect((await first).id).toBe(repeated.id);
    expect(
      await db.manager.countBy(CheckoutShippingQuote, { checkoutId: held.id }),
    ).toBe(1);
  });
  it('does not expose a complete total when one source cannot be quoted', async () => {
    const { held } = await quoteReady(true);
    quoteBehavior = async (data) => {
      if (data.from.name === 'Other pickup')
        throw new Error('CARRIER_UNAVAILABLE');
      return { fee: 25000, estimatedDeliveryAt: null };
    };
    const result = await quotes.refresh(buyer.id, held.id);
    expect(result.status).toBe('PARTIAL');
    expect(result.orders).toHaveLength(2);
    expect(
      result.orders.filter((order) => order.status === 'QUOTED'),
    ).toHaveLength(1);
    expect(result.totalShippingFee).toBeNull();
    expect(result.grandTotal).toBeNull();
  });
  it('requires pickup setup and never substitutes a zero fee for disabled carrier configuration', async () => {
    const { held, pickup } = await quoteReady();
    await db.manager.delete(PickupLocation, pickup.id);
    const missing = await quotes.refresh(buyer.id, held.id);
    expect(missing.orders[0].reason).toBe('PICKUP_REQUIRED');
    await db.manager.save(PickupLocation, pickup);
    quoteBehavior = async () => {
      throw new Error('CARRIER_NOT_CONFIGURED');
    };
    const disabled = await quotes.refresh(buyer.id, held.id);
    expect(disabled.status).toBe('UNAVAILABLE');
    expect(disabled.orders[0].fee).toBeNull();
    expect(disabled.orders[0].reason).toBe('CARRIER_NOT_CONFIGURED');
  });
  it('caps TTL at the hold deadline and makes aged quotes unusable', async () => {
    const { held } = await quoteReady();
    const deadline = new Date(Date.now() + 45000);
    await db.manager.update(Checkout, held.id, { expiresAt: deadline });
    const result = await quotes.refresh(buyer.id, held.id);
    expect(result.expiresAt).toBe(deadline.toISOString());
    await db.manager.update(CheckoutShippingQuote, result.id, {
      result: {
        ...result,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
    });
    const read = await service.findMine(buyer.id, held.id);
    expect(read.shippingQuote?.status).toBe('EXPIRED');
    expect(read.shippingQuote?.grandTotal).toBeNull();
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
  it('offers a buyer-scoped shipping quote endpoint without invented fees for missing packages', async () => {
    const p = await product();
    await cart.add(buyer.id, p.id);
    const held = await service.create(buyer.id, input([p.id]));
    const response = await request(app.getHttpServer())
      .post(`/api/checkouts/${held.id}/shipping-quotes`)
      .set('x-test-user', buyer.id)
      .send({})
      .expect(200);
    expect(response.body.data.status).toBe('UNAVAILABLE');
    expect(response.body.data.orders[0].reason).toBe('PACKAGE_REQUIRED');
    expect(response.body.data.totalShippingFee).toBeNull();
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
  it('snapshots resolved upper package bounds for future shipping quotes', async () => {
    const p = await product(0, seller.id, {
      shippingPackage: {
        weight: { mode: 'RANGE', preset: 'UP_TO_500_G' },
        size: { mode: 'CUSTOM', lengthCm: 20.1, widthCm: 15.5, heightCm: 8 },
      },
    });
    await cart.add(buyer.id, p.id);
    const created = await service.create(buyer.id, input([p.id]));
    expect(created.orders[0].items[0].shippingPackage).toEqual({
      weightGrams: 500,
      lengthCm: 21,
      widthCm: 16,
      heightCm: 8,
    });
    const response = await request(app.getHttpServer())
      .get(`/api/checkouts/${created.id}`)
      .set('x-test-user', buyer.id)
      .expect(200);
    expect(
      response.body.data.orders[0].items[0].shippingPackage.weightGrams,
    ).toBe(500);
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
