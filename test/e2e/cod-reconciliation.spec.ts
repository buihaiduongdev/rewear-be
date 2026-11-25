import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { AuthProvider } from '@/modules/auth/enums';
import { Order } from '@/modules/order/entities';
import { OrderWorker } from '@/modules/order/order.worker';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { createTestDatabase } from '../support/database';

describe('COD financial evidence HTTP authorization and privacy', () => {
  let app: INestApplication;
  let db: DataSource;
  let admin: User,
    owner: User,
    stranger: User,
    shop: Shop,
    order: Order,
    shipment: Shipment;
  let token: (user: User) => string;
  beforeAll(async () => {
    const database = await createTestDatabase();
    await database.destroy();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OrderWorker)
      .useValue({})
      .overrideProvider(ShipmentWorker)
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
    [admin, owner, stranger] = await db.getRepository(User).save(
      [UserRole.ADMIN, UserRole.USER, UserRole.USER].map((role) => ({
        email: `${randomUUID()}@test.local`,
        fullName: 'Test user',
        provider: AuthProvider.CREDENTIALS,
        status: UserStatus.ACTIVE,
        role,
      })),
    );
    shop = await db.getRepository(Shop).save({ name: 'Shop finance test' });
    await db.getRepository(ShopMember).save({
      shopId: shop.id,
      userId: owner.id,
      memberRole: ShopMemberRole.OWNER,
    });
    order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      buyerId: owner.id,
      shopId: shop.id,
      shopName: shop.name,
      paymentMethod: 'COD',
      status: 'delivered',
      subtotal: 200000,
      shippingFee: 30000,
      total: 230000,
      commissionBasisPoints: 300,
      createdAt: new Date(Date.now() - 7200000),
      sellerConfirmBy: new Date(),
      deliveryObservedAt: new Date(Date.now() - 3600000),
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
    shipment = await db.getRepository(Shipment).save({
      orderId: order.id,
      state: 'BOOKED',
      orderCode: randomUUID(),
      payload: {},
      input: {} as Shipment['input'],
      quotedParcel: {} as Shipment['quotedParcel'],
      codAmount: 230000,
      providerStatus: 'delivered',
    });
  });
  afterAll(async () => app?.close());
  it('only Admin records receipts; Owner reads own funds without private bank proof', async () => {
    const server = app.getHttpServer(),
      path = `/api/admin/orders/${order.id}/cod/collection`;
    const data = {
      requestId: randomUUID(),
      mode: 'EVIDENCE',
      waybillCode: shipment.orderCode,
      collectedAmount: 230000,
      approvedCarrierFee: 32000,
      collectedAt: new Date(Date.now() - 60000).toISOString(),
      reason: 'Verified carrier statement',
      evidence: 'PRIVATE_CARRIER_PROOF',
    };
    await request(server).post(path).send(data).expect(401);
    await request(server)
      .post(path)
      .auth(token(owner), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send(data)
      .expect(403);
    await request(server)
      .post(path)
      .auth(token(admin), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send({ ...data, available: 999999 })
      .expect(400);
    const recorded = await request(server)
      .post(path)
      .auth(token(admin), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send(data)
      .expect(200);
    expect(recorded.body.data.actorId).toBe(admin.id);
    expect(recorded.body.data.status).toBe('AWAITING');
    const batch = {
      requestId: randomUUID(),
      mode: 'EVIDENCE',
      reference: randomUUID(),
      netAmount: 198000,
      receivedAt: new Date().toISOString(),
      reason: 'Bank transfer matched',
      evidence: 'PRIVATE_BANK_PROOF',
      allocations: [
        { orderId: order.id, cashAmount: 198000, feeDeducted: 32000 },
      ],
    };
    await request(server)
      .post('/api/admin/cod/remittances')
      .auth(token(owner), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send(batch)
      .expect(403);
    await request(server)
      .post('/api/admin/cod/remittances')
      .auth(token(admin), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send(batch)
      .expect(200);
    const financePath = `/api/shops/${shop.id}/finance`;
    await request(server)
      .get(financePath)
      .auth(token(stranger), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .expect(403);
    const balance = await request(server)
      .get(financePath)
      .auth(token(owner), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .expect(200);
    expect(balance.body.data.held).toBe(194000);
    expect(balance.body.data.available).toBe(0);
    expect(balance.text).not.toContain('PRIVATE_');
    await request(server)
      .get(financePath + '?mode=SIMULATION')
      .auth(token(owner), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.held).toBe(0);
      });
    await request(server)
      .get(financePath + '?offset=-1')
      .auth(token(owner), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .expect(400);
    await request(server)
      .get(`/api/admin/orders/${order.id}/cod/reconciliation`)
      .auth(token(owner), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .expect(403);
    const detail = await request(server)
      .get(`/api/admin/orders/${order.id}/cod/reconciliation`)
      .auth(token(admin), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .expect(200);
    expect(detail.text).toContain('PRIVATE_BANK_PROOF');
    await request(server)
      .post(`/api/admin/orders/${order.id}/cod/reconciliation/refresh`)
      .auth(token(owner), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send({})
      .expect(403);
    await request(server)
      .post(`/api/admin/orders/${order.id}/cod/reconciliation/refresh`)
      .auth(token(admin), { type: 'bearer' })
      .set('x-shop-id', shop.id)
      .send({})
      .expect(200);
  });
});
