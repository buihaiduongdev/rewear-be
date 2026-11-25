import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import ms from 'ms';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { AuthProvider } from '@/modules/auth/enums';
import { Order, OrderEvent } from '@/modules/order/entities';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { createTestDatabase } from '../support/database';

describe('Receipt and delivery verification HTTP permissions', () => {
  let app: INestApplication;
  let db: DataSource;
  let admin: User, buyer: User, stranger: User, order: Order;
  let token: (user: User) => string;
  const privateProof = 'Private signed delivery receipt evidence';
  beforeAll(async () => {
    const database = await createTestDatabase();
    await database.destroy();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OrderWorker)
      .useValue({})
      .overrideProvider(ShipmentWorker)
      .useValue({})
      .overrideProvider(OrderSettlementWorker)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useLogger(false);
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    db = app.get(DataSource);
    token = (user) =>
      app
        .get(JwtService)
        .sign({ sub: user.id }, { secret: process.env.JWT_ACCESS_SECRET });
    [admin, buyer, stranger] = await db.getRepository(User).save(
      [UserRole.ADMIN, UserRole.USER, UserRole.USER].map((role) => ({
        email: `${randomUUID()}@test.local`,
        fullName: 'Receipt test',
        provider: AuthProvider.CREDENTIALS,
        status: UserStatus.ACTIVE,
        role,
      })),
    );
    const shop = await db.getRepository(Shop).save({ name: 'Receipt shop' });
    order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      buyerId: buyer.id,
      shopId: shop.id,
      shopName: shop.name,
      paymentMethod: 'COD',
      status: 'delivered',
      subtotal: 200000,
      shippingFee: 30000,
      total: 230000,
      commissionBasisPoints: 300,
      createdAt: new Date(Date.now() - ms('24h')),
      sellerConfirmBy: new Date(),
      deliveryObservedAt: new Date(Date.now() - ms('1h')),
      address: {},
      items: [
        {
          productId: randomUUID(),
          title: 'Jacket',
          price: 200000,
          size: null,
          condition: 'GOOD',
          coverUrl: null,
          shippingPackage: null,
        },
      ],
    });
    await db.getRepository(Shipment).save({
      orderId: order.id,
      state: 'BOOKED',
      orderCode: randomUUID(),
      payload: {},
      input: {} as Shipment['input'],
      quotedParcel: {} as Shipment['quotedParcel'],
      codAmount: order.total,
      providerStatus: 'delivered',
    });
  });
  afterAll(async () => app?.close());
  const receiptPath = () => `/api/orders/${order.id}/confirm-receipt`;
  const verificationPath = () =>
    `/api/admin/orders/${order.id}/delivery-verification`;
  const proof = () => ({
    deliveredAt: order.deliveryObservedAt!.toISOString(),
    mode: 'EVIDENCE',
    reason: 'Checked signed carrier proof',
    evidence: privateProof,
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).post(receiptPath()).send({}).expect(401);
  });
  it('rejects delivery verification by buyer and unrelated users', async () => {
    for (const user of [buyer, stranger])
      await request(app.getHttpServer())
        .post(verificationPath())
        .auth(token(user), { type: 'bearer' })
        .send(proof())
        .expect(403);
  });
  it('validates admin evidence, strict body, UUID and timestamp', async () => {
    await request(app.getHttpServer())
      .post(verificationPath())
      .auth(token(admin), { type: 'bearer' })
      .send({ ...proof(), evidence: '' })
      .expect(400);
    await request(app.getHttpServer())
      .post(verificationPath())
      .auth(token(admin), { type: 'bearer' })
      .send({ ...proof(), deliveredAt: 'yesterday' })
      .expect(400);
    await request(app.getHttpServer())
      .post(receiptPath())
      .auth(token(buyer), { type: 'bearer' })
      .send({ deliveredAt: new Date().toISOString() })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/orders/not-a-uuid/confirm-receipt')
      .auth(token(buyer), { type: 'bearer' })
      .send({})
      .expect(400);
  });
  it('does not allow another buyer to confirm the order', async () => {
    await request(app.getHttpServer())
      .post(receiptPath())
      .auth(token(stranger), { type: 'bearer' })
      .send({})
      .expect(404);
  });
  it('establishes the deadline and confirms receipt without leaking verification evidence', async () => {
    const verified = await request(app.getHttpServer())
      .post(verificationPath())
      .auth(token(admin), { type: 'bearer' })
      .send(proof())
      .expect(200);
    const acknowledged = await request(app.getHttpServer())
      .post(receiptPath())
      .auth(token(buyer), { type: 'bearer' })
      .send({})
      .expect(200);
    expect(acknowledged.body.data.status).toBe('completed');
    expect(acknowledged.body.data.disputeDeadlineAt).toBe(
      verified.body.data.disputeDeadlineAt,
    );
    const detail = await request(app.getHttpServer())
      .get(`/api/orders/${order.id}`)
      .auth(token(buyer), { type: 'bearer' })
      .expect(200);
    expect(JSON.stringify(detail.body)).not.toContain(privateProof);
    await request(app.getHttpServer())
      .post(receiptPath())
      .auth(token(buyer), { type: 'bearer' })
      .send({})
      .expect(200);
    expect(
      await db
        .getRepository(OrderEvent)
        .countBy({ orderId: order.id, action: 'RECEIPT_CONFIRMED' }),
    ).toBe(1);
  });
});
