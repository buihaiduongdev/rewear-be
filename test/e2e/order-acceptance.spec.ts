import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { MarketplaceFactory } from '@/modules/database/seeds/factories/marketplace.factory';
import { Order } from '@/modules/order/order.entity';
import { OrderWorker } from '@/modules/order/order.worker';
import { PaymentAttempt } from '@/modules/payment/payment.entity';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';

import { createTestDatabase } from '../support/database';

describe('order acceptance HTTP contract (real JWT and PostgreSQL)', () => {
  let app: INestApplication;
  let db: DataSource;
  let buyer: User;
  let owner: User;
  let stranger: User;
  let order: Order;
  let shop: Shop;
  let token: (user: User) => string;

  beforeAll(async () => {
    const database = await createTestDatabase();
    await database.destroy();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OrderWorker)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useLogger(false);
    await app.init();
    db = app.get(DataSource);
    const jwt = app.get(JwtService);
    token = (user) =>
      jwt.sign({ sub: user.id }, { secret: process.env.JWT_ACCESS_SECRET });
    const factory = new MarketplaceFactory(randomUUID());
    [buyer, owner, stranger] = await db
      .getRepository(User)
      .save([0, 1, 2].map((i) => factory.user(i, 'unused')));
    shop = await db.getRepository(Shop).save(factory.shop(0));
    await db
      .getRepository(ShopMember)
      .save(factory.shopMember(0, shop.id, owner.id));
    const address = {
      recipientName: 'Buyer',
      phone: '0912345678',
      addressLine1: 'Test',
      addressLine2: null,
      countryCode: 'VN',
      provinceCode: '79',
      provinceName: 'HCM',
      wardCode: '1',
      wardName: 'Ward',
      postalCode: null,
      deliveryInstructions: null,
    };
    const checkout = await db.getRepository(Checkout).save({
      buyerId: buyer.id,
      requestId: randomUUID(),
      addressId: randomUUID(),
      requestedProductIds: [],
      address,
      status: 'PAID',
      expiresAt: new Date(),
      removedItems: [],
    });
    const payment = await db.getRepository(PaymentAttempt).save({
      checkoutId: checkout.id,
      buyerId: buyer.id,
      requestId: randomUUID(),
      amount: 230000,
      orders: [],
      state: 'PAID',
      nextQueryAt: new Date(),
      paidAt: new Date(),
    });
    order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      paymentId: payment.id,
      buyerId: buyer.id,
      shopId: shop.id,
      shopName: shop.name,
      status: 'pending',
      subtotal: 200000,
      shippingFee: 30000,
      total: 230000,
      address,
      items: [],
      sellerConfirmBy: new Date(Date.now() + 86400000),
    });
  });
  afterAll(async () => app?.close());

  it('requires authentication, scopes reads and validates pagination and rejection before writing', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/orders/mine').expect(401);
    await request(server)
      .get(`/api/orders/${order.id}`)
      .auth(token(stranger), { type: 'bearer' })
      .expect(404);
    await request(server)
      .get('/api/orders/mine?limit=101')
      .auth(token(buyer), { type: 'bearer' })
      .expect(400);
    const list = await request(server)
      .get('/api/orders/mine?limit=1&status=pending')
      .auth(token(buyer), { type: 'bearer' })
      .expect(200);
    expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([
      order.id,
    ]);
    const path = `/api/shops/${shop.id}/orders/${order.id}`;
    await request(server)
      .post(`${path}/reject`)
      .auth(token(stranger), { type: 'bearer' })
      .send({ reason: 'Cannot fulfil' })
      .expect(403);
    await request(server)
      .post(`${path}/reject`)
      .auth(token(owner), { type: 'bearer' })
      .send({ reason: '   ' })
      .expect(400);
    await request(server)
      .post(`${path}/reject`)
      .auth(token(owner), { type: 'bearer' })
      .send({ reason: 'Cannot fulfil', amount: 1 })
      .expect(400);
    const rejected = await request(server)
      .post(`${path}/reject`)
      .auth(token(owner), { type: 'bearer' })
      .send({ reason: '  Cannot   fulfil  ' })
      .expect(200);
    expect(rejected.body.data.status).toBe('cancelled');
    expect(rejected.body.data.cancellationNote).toBe('Cannot fulfil');
    expect(rejected.body.data.walletRefund.amount).toBe(230000);
    expect(
      rejected.body.data.events.map(
        (event: { action: string }) => event.action,
      ),
    ).toEqual(['REJECTED']);
    const wallet = await request(server)
      .get('/api/wallet/mine')
      .auth(token(buyer), { type: 'bearer' })
      .expect(200);
    expect(wallet.body.data.balance).toBe(230000);
    expect(wallet.body.data.credits).toHaveLength(1);
    const otherWallet = await request(server)
      .get('/api/wallet/mine')
      .auth(token(stranger), { type: 'bearer' })
      .expect(200);
    expect(otherWallet.body.data.balance).toBe(0);
    await request(server)
      .post(`${path}/accept`)
      .auth(token(owner), { type: 'bearer' })
      .send({})
      .expect(409);
    const detail = await request(server)
      .get(`/api/orders/${order.id}`)
      .auth(token(buyer), { type: 'bearer' })
      .expect(200);
    expect(detail.body.data.walletRefund.amount).toBe(230000);
    expect(detail.body.data.createdAt).toBeUndefined(); // serialization excludes internal fields
  });
});
