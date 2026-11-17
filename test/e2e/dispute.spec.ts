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
import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';
import { AuthProvider } from '@/modules/auth/enums';
import { DisputeWorker } from '@/modules/dispute/dispute.worker';
import { DisputeEvidence } from '@/modules/dispute/entities/dispute.entity';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { Order } from '@/modules/order/entities/order.entity';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { createTestDatabase } from '../support/database';

describe('Dispute API and private evidence HTTP', () => {
  let app: INestApplication;
  let db: DataSource;
  let buyer: User, owner: User, stranger: User, admin: User, order: Order;
  let token: (user: User) => string;
  let issueId: string, evidenceId: string;
  const storage = {
    assertConfigured: jest.fn(),
    createUploadTicket: jest.fn(async () => ({
      uploadUrl: 'https://private.test/upload?signature=short',
      method: 'PUT',
      headers: { 'If-None-Match': '*' },
      expiresAt: new Date(Date.now() + ms('15m')),
    })),
    getObjectMetadata: jest.fn(async () => ({
      eTag: 'fixed-etag',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    })),
    createDownloadUrl: jest.fn(async () => ({
      url: 'https://private.test/read?signature=short',
      headers: { 'If-Match': 'fixed-etag' },
      expiresAt: new Date(Date.now() + ms('5m')),
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
      .overrideProvider(PrivateEvidenceStorage)
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
    [buyer, owner, stranger, admin] = await db.getRepository(User).save(
      [UserRole.USER, UserRole.USER, UserRole.USER, UserRole.ADMIN].map(
        (role) => ({
          email: `${randomUUID()}@test.local`,
          fullName: 'Dispute test user',
          provider: AuthProvider.CREDENTIALS,
          status: UserStatus.ACTIVE,
          role,
        }),
      ),
    );
    const shop = await db
      .getRepository(Shop)
      .save({ name: 'Dispute test shop' });
    await db.getRepository(ShopMember).save({
      shopId: shop.id,
      userId: owner.id,
      memberRole: ShopMemberRole.OWNER,
    });
    const deliveredAt = new Date(Date.now() - ms('1h'));
    const deadline = new Date(deliveredAt.getTime() + ms('72h'));
    order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      buyerId: buyer.id,
      shopId: shop.id,
      shopName: shop.name,
      paymentMethod: 'COD',
      status: 'completed',
      subtotal: 100000,
      shippingFee: 30000,
      total: 130000,
      createdAt: new Date(Date.now() - ms('24h')),
      sellerConfirmBy: new Date(),
      deliveryObservedAt: deliveredAt,
      deliveryVerifiedAt: deliveredAt,
      disputeDeadlineAt: deadline,
      address: {},
      items: [
        {
          productId: randomUUID(),
          title: 'Jacket',
          price: 100000,
          size: null,
          condition: 'GOOD',
          coverUrl: null,
          shippingPackage: null,
        },
      ],
    });
    await db.getRepository(OrderDeliveryVerification).save({
      orderId: order.id,
      deliveredAt,
      disputeDeadlineAt: deadline,
      mode: 'SIMULATION',
      actorId: admin.id,
      reason: 'Timestamp checked',
      evidence: 'Private carrier proof not part of dispute',
    });
  });
  afterAll(async () => app?.close());
  const input = () => ({
    productId: order.items[0].productId,
    kind: 'WRONG_ITEM',
    description: 'Different jacket from listing',
    evidenceIds: [],
  });
  const path = () => `/api/orders/${order.id}/dispute/issues`;
  it('requires authentication and order ownership', async () => {
    await request(app.getHttpServer()).post(path()).send(input()).expect(401);
    await request(app.getHttpServer())
      .post(path())
      .auth(token(stranger), { type: 'bearer' })
      .send(input())
      .expect(404);
  });
  it('validates strict intake body, kind and query', async () => {
    await request(app.getHttpServer())
      .post(path())
      .auth(token(buyer), { type: 'bearer' })
      .send({ ...input(), status: 'ACTIVE' })
      .expect(400);
    await request(app.getHttpServer())
      .post(path())
      .auth(token(buyer), { type: 'bearer' })
      .send({ ...input(), kind: 'OTHER' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/disputes/mine?offset=-1')
      .auth(token(buyer), { type: 'bearer' })
      .expect(400);
  });
  it('opens incomplete issue after early completion and holds the order', async () => {
    const response = await request(app.getHttpServer())
      .post(path())
      .auth(token(buyer), { type: 'bearer' })
      .send(input())
      .expect(200);
    issueId = response.body.data.id;
    expect(response.body.data.status).toBe('NEEDS_EVIDENCE');
    expect(
      (await db.getRepository(Order).findOneByOrFail({ id: order.id })).status,
    ).toBe('dispute');
  });
  it('creates private upload ticket without public URL/key; rejects unsafe requests', async () => {
    const uploadPath = `/api/orders/${order.id}/dispute-evidence/uploads`;
    const payload = {
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      tags: ['ISSUE'],
    };
    await request(app.getHttpServer())
      .post(uploadPath)
      .auth(token(stranger), { type: 'bearer' })
      .send(payload)
      .expect(403);
    await request(app.getHttpServer())
      .post(uploadPath)
      .auth(token(buyer), { type: 'bearer' })
      .send({ ...payload, mimeType: 'text/html' })
      .expect(400);
    await request(app.getHttpServer())
      .post(uploadPath)
      .auth(token(buyer), { type: 'bearer' })
      .send({ ...payload, sizeBytes: 100000000 })
      .expect(400);
    const uploaded = await request(app.getHttpServer())
      .post(uploadPath)
      .auth(token(buyer), { type: 'bearer' })
      .send(payload)
      .expect(200);
    evidenceId = uploaded.body.data.id;
    expect(uploaded.body.data).not.toHaveProperty('storageKey');
    expect(uploaded.body.data).not.toHaveProperty('publicUrl');
  });
  it('confirms only uploader-owned objects with checked metadata', async () => {
    const confirmPath = `/api/dispute-evidence/${evidenceId}/confirm`;
    await request(app.getHttpServer())
      .post(confirmPath)
      .auth(token(stranger), { type: 'bearer' })
      .send({})
      .expect(403);
    storage.getObjectMetadata.mockResolvedValueOnce({
      eTag: 'fixed-etag',
      contentType: 'image/jpeg',
      sizeBytes: 1,
    });
    await request(app.getHttpServer())
      .post(confirmPath)
      .auth(token(buyer), { type: 'bearer' })
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post(confirmPath)
      .auth(token(buyer), { type: 'bearer' })
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/dispute-evidence/${evidenceId}/download`)
      .auth(token(owner), { type: 'bearer' })
      .expect(403);
  });
  it('attaches evidence and grants private access only to parties/Admin', async () => {
    const supplemented = await request(app.getHttpServer())
      .post(`/api/dispute-issues/${issueId}/evidence`)
      .auth(token(buyer), { type: 'bearer' })
      .send({ evidenceIds: [evidenceId] })
      .expect(200);
    expect(supplemented.body.data.status).toBe('ACTIVE');
    for (const user of [buyer, owner])
      await request(app.getHttpServer())
        .get(`/api/dispute-evidence/${evidenceId}/download`)
        .auth(token(user), { type: 'bearer' })
        .expect(200);
    await request(app.getHttpServer())
      .get(`/api/dispute-evidence/${evidenceId}/download`)
      .auth(token(stranger), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/admin/dispute-evidence/${evidenceId}/download`)
      .auth(token(admin), { type: 'bearer' })
      .expect(200);
    const view = await request(app.getHttpServer())
      .get(`/api/orders/${order.id}/dispute`)
      .auth(token(owner), { type: 'bearer' })
      .expect(200);
    const key = (
      await db
        .getRepository(DisputeEvidence)
        .findOneByOrFail({ id: evidenceId })
    ).storageKey;
    expect(JSON.stringify(view.body)).not.toContain(key);
    expect(JSON.stringify(view.body)).not.toContain('Private carrier proof');
    await request(app.getHttpServer())
      .get(`/api/orders/${order.id}/dispute`)
      .auth(token(stranger), { type: 'bearer' })
      .expect(403);
  });
  it('only Admin can list all cases or extend SLA; parties can reply', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/disputes')
      .auth(token(buyer), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/admin/disputes')
      .auth(token(admin), { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/admin/dispute-issues/${issueId}/extend`)
      .auth(token(owner), { type: 'bearer' })
      .send({ reason: 'Need more review' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/dispute-issues/${issueId}/replies`)
      .auth(token(owner), { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        text: 'Packing proof explained',
        evidenceIds: [],
      })
      .expect(200);
  });
});
