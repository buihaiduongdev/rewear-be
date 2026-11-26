import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { StorageService } from '@/infrastructure/storage';
import { AuthProvider } from '@/modules/auth/enums';
import { CoinRewardWorker } from '@/modules/coins/rewards/coin-reward.worker';
import { DisputeWorker } from '@/modules/dispute/dispute.worker';
import { Order } from '@/modules/order/entities';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { createTestDatabase } from '../support/database';

describe('Verified Shop ratings HTTP', () => {
  let app: INestApplication;
  let db: DataSource;
  let buyer: User, owner: User, staff: User, admin: User, order: Order;
  let token: (user: User) => string;
  let ratingId: string;
  const storage = {
    assertConfigured: jest.fn(),
    createUploadTicket: jest.fn(async () => ({
      key: `uploads/${randomUUID()}.jpg`,
      uploadUrl: 'https://private.test/upload',
      method: 'PUT',
      headers: { 'If-None-Match': '*' },
      expiresAt: new Date(Date.now() + 900000),
    })),
    getObjectMetadata: jest.fn(async () => ({
      eTag: 'immutable-etag',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    })),
    createDownloadUrl: jest.fn(async () => ({
      url: 'https://private.test/read',
      headers: { 'If-Match': 'immutable-etag' },
      expiresAt: new Date(Date.now() + 300000),
    })),
  };
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
      .overrideProvider(DisputeWorker)
      .useValue({})
      .overrideProvider(CoinRewardWorker)
      .useValue({})
      .overrideProvider(StorageService)
      .useValue(storage)
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
    [buyer, owner, staff, admin] = await db.getRepository(User).save(
      [UserRole.USER, UserRole.USER, UserRole.USER, UserRole.ADMIN].map(
        (role) => ({
          email: `${randomUUID()}@test.local`,
          fullName: 'Rating actor',
          provider: AuthProvider.CREDENTIALS,
          status: UserStatus.ACTIVE,
          role,
        }),
      ),
    );
    const shop = await db
      .getRepository(Shop)
      .save({ name: 'Rating HTTP Shop' });
    for (const [user, memberRole] of [
      [owner, ShopMemberRole.OWNER],
      [staff, ShopMemberRole.STAFF],
    ] as const)
      await db
        .getRepository(ShopMember)
        .save({ shopId: shop.id, userId: user.id, memberRole });
    const deliveredAt = new Date(Date.now() - 3600000);
    order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      buyerId: buyer.id,
      shopId: shop.id,
      shopName: shop.name,
      paymentMethod: 'COD',
      status: 'completed',
      subtotal: 100000,
      shippingFee: 0,
      total: 100000,
      sellerConfirmBy: new Date(),
      deliveryVerifiedAt: deliveredAt,
      address: {},
      items: [],
    });
    await db.getRepository(OrderDeliveryVerification).save({
      orderId: order.id,
      deliveredAt,
      disputeDeadlineAt: new Date(),
      mode: 'EVIDENCE',
      actorId: admin.id,
      reason: 'Carrier verified',
      evidence: 'Signed delivery record',
    });
  });
  afterAll(async () => app?.close());
  it('requires authentication and active buyer ownership; exposes no deletion route', async () => {
    await request(app.getHttpServer())
      .post('/api/ratings')
      .send({ orderId: order.id, stars: 1 })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/ratings')
      .auth(token(owner), { type: 'bearer' })
      .send({ orderId: order.id, stars: 1 })
      .expect(404);
    const result = await request(app.getHttpServer())
      .post('/api/ratings')
      .auth(token(buyer), { type: 'bearer' })
      .send({ orderId: order.id, stars: 1, comment: 'Needs improvement' })
      .expect(200);
    ratingId = result.body.data.id;
    await request(app.getHttpServer())
      .delete(`/api/ratings/${ratingId}`)
      .auth(token(buyer), { type: 'bearer' })
      .expect(404);
  });
  it('serves a public aggregate without order references, keys or history', async () => {
    const result = await request(app.getHttpServer())
      .get(`/api/ratings/shops/${order.shopId}`)
      .expect(200);
    expect(result.body.data.summary).toMatchObject({
      mode: 'EVIDENCE',
      count: 1,
      average: 1,
    });
    expect(result.body.data.ratings[0]).not.toHaveProperty('orderId');
    expect(result.body.data.ratings[0]).not.toHaveProperty('buyerId');
    expect(result.body.data.ratings[0]).not.toHaveProperty('storageKey');
    const sim = await request(app.getHttpServer())
      .get(`/api/ratings/shops/${order.shopId}?mode=SIMULATION`)
      .expect(200);
    expect(sim.body.data.summary.count).toBe(0);
  });
  it('protects the dedicated Shop reply permission and retains the reply on buyer edits', async () => {
    await request(app.getHttpServer())
      .post(`/api/ratings/${ratingId}/reply`)
      .set('X-Shop-Id', order.shopId)
      .auth(token(staff), { type: 'bearer' })
      .send({ text: 'Staff cannot reply by default' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/ratings/${ratingId}/reply`)
      .set('X-Shop-Id', order.shopId)
      .auth(token(owner), { type: 'bearer' })
      .send({ text: 'Shop response' })
      .expect(200);
    const edited = await request(app.getHttpServer())
      .post('/api/ratings')
      .auth(token(buyer), { type: 'bearer' })
      .send({ orderId: order.id, stars: 2 })
      .expect(200);
    expect(edited.body.data.reply).toBe('Shop response');
  });
  it('uses owned public upload tickets and hides moderated media URLs', async () => {
    const upload = await request(app.getHttpServer())
      .post('/api/media/upload-ticket')
      .auth(token(buyer), { type: 'bearer' })
      .send({ mimeType: 'image/jpeg', sizeBytes: 1024, visibility: 'public' })
      .expect(201);
    const ticketId = upload.body.data.id;
    const rated = await request(app.getHttpServer())
      .post('/api/ratings')
      .auth(token(buyer), { type: 'bearer' })
      .send({ orderId: order.id, stars: 2, mediaIds: [ticketId] })
      .expect(200);
    expect(rated.body.data.mediaIds).toEqual([ticketId]);
    expect(rated.body.data).not.toHaveProperty('storageKey');
    const beforeModeration = await request(app.getHttpServer())
      .get(`/api/ratings/shops/${order.shopId}`)
      .expect(200);
    expect(beforeModeration.body.data.ratings[0].mediaUrls).toHaveLength(1);
    await request(app.getHttpServer())
      .post(`/api/ratings/${ratingId}/moderation`)
      .auth(token(owner), { type: 'bearer' })
      .send({
        component: 'media',
        hidden: true,
        basis: 'CONTENT_VIOLATION',
        reason: 'Reviewed violation',
        evidence: 'Review record',
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/ratings/${ratingId}/moderation`)
      .auth(token(admin), { type: 'bearer' })
      .send({
        component: 'media',
        hidden: true,
        basis: 'CONTENT_VIOLATION',
        reason: 'Reviewed violation',
        evidence: 'Review record',
      })
      .expect(200);
    const page = await request(app.getHttpServer())
      .get(`/api/ratings/shops/${order.shopId}`)
      .expect(200);
    expect(page.body.data.summary.count).toBe(1);
    expect(page.body.data.ratings[0].mediaIds).toEqual([]);
    expect(page.body.data.ratings[0].mediaUrls).toEqual([]);
  });
});
