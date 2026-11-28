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
import { StorageService } from '@/infrastructure/storage';
import { AuthProvider } from '@/modules/auth/enums';
import { CodReconciliationService } from '@/modules/cod-reconciliation/cod-reconciliation.service';
import { CoinService } from '@/modules/coins/coin.service';
import { DisputeWorker } from '@/modules/dispute/dispute.worker';
import { DisputeEvidence } from '@/modules/dispute/entities/dispute-evidence.entity';
import { Order } from '@/modules/order/entities';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';
import { WalletAccount } from '@/modules/wallet/entities';

import { createTestDatabase } from '../support/database';

describe('Dispute FEAT-09 end-to-end HTTP lifecycle', () => {
  let app: INestApplication;
  let db: DataSource;
  let buyer: User,
    owner: User,
    stranger: User,
    admin: User,
    reviewer: User,
    order: Order;
  let token: (user: User) => string;
  let evidenceId: string, issueId: string, decisionId: string, returnId: string;

  const storage = {
    assertConfigured: jest.fn(),
    createUploadTicket: jest.fn(async () => ({
      key: `uploads/${randomUUID()}.jpg`,
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

    [buyer, owner, stranger, admin, reviewer] = await db
      .getRepository(User)
      .save(
        [
          UserRole.USER,
          UserRole.USER,
          UserRole.USER,
          UserRole.ADMIN,
          UserRole.ADMIN,
        ].map((role) => ({
          email: `${randomUUID()}@test.local`,
          fullName: 'Dispute E2E user',
          provider: AuthProvider.CREDENTIALS,
          status: UserStatus.ACTIVE,
          role,
        })),
      );
    const shop = await db
      .getRepository(Shop)
      .save({ name: 'Dispute E2E shop' });
    await db.getRepository(ShopMember).save({
      shopId: shop.id,
      userId: owner.id,
      memberRole: ShopMemberRole.OWNER,
    });

    const deliveredAt = new Date(Date.now() - ms('2h'));
    const deadline = new Date(deliveredAt.getTime() + ms('72h'));
    order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      buyerId: buyer.id,
      shopId: shop.id,
      shopName: shop.name,
      paymentMethod: 'COD',
      status: 'delivered',
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
    const shipment = await db.getRepository(Shipment).save({
      orderId: order.id,
      state: 'BOOKED',
      orderCode: randomUUID(),
      payload: {},
      input: {} as Shipment['input'],
      quotedParcel: {} as Shipment['quotedParcel'],
      codAmount: order.total,
      providerStatus: 'delivered',
    });
    await new CodReconciliationService(
      db,
      new CoinService(db),
    ).recordCollection(admin.id, order.id, {
      mode: 'EVIDENCE',
      waybillCode: shipment.orderCode!,
      collectedAmount: order.total,
      approvedCarrierFee: 0,
      collectedAt: deliveredAt.toISOString(),
      reason: 'Verified COD collection',
      evidence: 'Signed carrier proof',
    });
    await db.getRepository(OrderDeliveryVerification).save({
      orderId: order.id,
      deliveredAt,
      disputeDeadlineAt: deadline,
      mode: 'EVIDENCE',
      actorId: admin.id,
      reason: 'Timestamp checked',
      evidence: 'Private carrier proof',
    });
  });

  afterAll(async () => app?.close());

  it('registers private evidence and opens dispute within 72h', async () => {
    const upload = await request(app.getHttpServer())
      .post('/api/media/upload-ticket')
      .auth(token(buyer), { type: 'bearer' })
      .send({ mimeType: 'image/jpeg', sizeBytes: 1024, visibility: 'private' })
      .expect(201);

    const attached = await request(app.getHttpServer())
      .post(`/api/orders/${order.id}/dispute-evidence`)
      .auth(token(buyer), { type: 'bearer' })
      .send({ mediaId: upload.body.data.id, tags: ['ISSUE', 'UNBOX'] })
      .expect(200);
    evidenceId = attached.body.data.id;
    expect(attached.body.data).not.toHaveProperty('storageKey');

    // Counterpart cannot download before submission
    await request(app.getHttpServer())
      .get(`/api/dispute-evidence/${evidenceId}/download`)
      .auth(token(owner), { type: 'bearer' })
      .expect(403);

    const opened = await request(app.getHttpServer())
      .post(`/api/orders/${order.id}/dispute/issues`)
      .auth(token(buyer), { type: 'bearer' })
      .send({
        productId: order.items[0].productId,
        kind: 'WRONG_ITEM',
        description: 'Different jacket from listing',
        evidenceIds: [evidenceId],
      })
      .expect(200);
    issueId = opened.body.data.id;
    expect(opened.body.data.status).toBe('ACTIVE');

    // Counterpart can download submitted evidence, stranger is blocked
    await request(app.getHttpServer())
      .get(`/api/dispute-evidence/${evidenceId}/download`)
      .auth(token(owner), { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/dispute-evidence/${evidenceId}/download`)
      .auth(token(stranger), { type: 'bearer' })
      .expect(403);

    const key = (
      await db
        .getRepository(DisputeEvidence)
        .findOneByOrFail({ id: evidenceId })
    ).media.storageKey;
    const detail = await request(app.getHttpServer())
      .get(`/api/orders/${order.id}/dispute`)
      .auth(token(owner), { type: 'bearer' })
      .expect(200);
    expect(JSON.stringify(detail.body)).not.toContain(key);
  });

  it('completes seller reply -> admin decision -> 2-day appeal -> return -> automatic wallet refund', async () => {
    await request(app.getHttpServer())
      .post(`/api/dispute-issues/${issueId}/replies`)
      .auth(token(owner), { type: 'bearer' })
      .send({ text: 'Item matched SKU label', evidenceIds: [] })
      .expect(200);

    const decided = await request(app.getHttpServer())
      .post(`/api/admin/dispute-issues/${issueId}/decision`)
      .auth(token(admin), { type: 'bearer' })
      .send({
        outcome: 'REJECT_CLAIM',
        responsibility: 'UNDETERMINED',
        reason: 'Initial rejection',
      })
      .expect(200);
    decisionId = decided.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/dispute-decisions/${decisionId}/appeals`)
      .auth(token(buyer), { type: 'bearer' })
      .send({
        reason: 'Unboxing video clearly shows wrong brand label',
        evidenceIds: [],
      })
      .expect(200);

    const concluded = await request(app.getHttpServer())
      .post(`/api/admin/dispute-decisions/${decisionId}/appeal-decision`)
      .auth(token(reviewer), { type: 'bearer' })
      .send({
        outcome: 'REQUIRE_RETURN',
        responsibility: 'SELLER',
        reason: 'Appeal upheld; return item for full refund',
      })
      .expect(200);
    expect(concluded.body.data.finalOutcome).toBe('REQUIRE_RETURN');

    const refundBefore = await request(app.getHttpServer())
      .get(`/api/dispute-decisions/${decisionId}/refund`)
      .auth(token(buyer), { type: 'bearer' })
      .expect(200);
    returnId = refundBefore.body.data.returnCase.id;
    expect(refundBefore.body.data.returnCase.state).toBe('WAITING_LABEL');

    await request(app.getHttpServer())
      .post(`/api/admin/dispute-returns/${returnId}/label`)
      .auth(token(admin), { type: 'bearer' })
      .send({ mode: 'EVIDENCE', waybillCode: 'GHN-E2E-RETURN-01' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/dispute-returns/${returnId}/handover`)
      .auth(token(buyer), { type: 'bearer' })
      .send({})
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/dispute-returns/${returnId}/confirm-receipt`)
      .auth(token(owner), { type: 'bearer' })
      .send({})
      .expect(200);

    const refundAfter = await request(app.getHttpServer())
      .get(`/api/dispute-decisions/${decisionId}/refund`)
      .auth(token(buyer), { type: 'bearer' })
      .expect(200);
    expect(refundAfter.body.data.credit.amount).toBe(100000);
    expect(
      (
        await db
          .getRepository(WalletAccount)
          .findOneByOrFail({ userId: buyer.id })
      ).balance,
    ).toBe(100000);
  });
});
