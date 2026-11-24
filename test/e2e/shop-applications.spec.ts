import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';
import { CoinRewardWorker } from '@/modules/coins/rewards/coin-reward.worker';
import { DisputeWorker } from '@/modules/dispute/dispute.worker';
import {
  Notification,
  NotificationEmailJob,
} from '@/modules/notifications/entities/notification.entity';
import { NotificationWorker } from '@/modules/notifications/notification.worker';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { ShopBankAccount } from '@/modules/shop-finance/payouts/entities/shop-bank-account.entity';
import { IdentityRenewalWorker } from '@/modules/shop/applications/renewal/identity-renewal.worker';
import { Shop } from '@/modules/shop/entities';
import { ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';
import type { User } from '@/modules/user/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Owner KYC application HTTP', () => {
  let app: INestApplication;
  let db: DataSource;
  let f: Awaited<ReturnType<typeof adjudicationFixture>>;
  let stranger: User;
  let token: (user: User) => string;
  let shopId: string;
  let applicationId: string;
  let version: number;
  let bankId: string;
  const docs: string[] = [];
  const storage = {
    assertConfigured: jest.fn(),
    createUploadTicket: jest.fn(async () => ({
      uploadUrl: 'https://private.test/put',
      method: 'PUT',
      headers: { 'If-None-Match': '*' },
      expiresAt: new Date(Date.now() + 60000),
    })),
    getObjectMetadata: jest.fn(async () => ({
      eTag: 'immutable',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    })),
    createDownloadUrl: jest.fn(async () => ({
      url: 'https://private.test/read',
      headers: { 'If-Match': 'immutable' },
      expiresAt: new Date(Date.now() + 60000),
    })),
  };
  beforeAll(async () => {
    const database = await createTestDatabase();
    await database.destroy();
    let builder = Test.createTestingModule({ imports: [AppModule] });
    for (const worker of [
      NotificationWorker,
      OrderWorker,
      OrderSettlementWorker,
      ShipmentWorker,
      DisputeWorker,
      CoinRewardWorker,
      IdentityRenewalWorker,
    ])
      builder = builder.overrideProvider(worker).useValue({});
    const module = await builder
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
    f = await adjudicationFixture(db);
    stranger = (await adjudicationFixture(db)).buyer;
    token = (user) =>
      app
        .get(JwtService)
        .sign({ sub: user.id }, { secret: process.env.JWT_ACCESS_SECRET });
  });
  afterAll(async () => app?.close());
  it('creates a pending Shop, blocks public sale/activation and requires its current Owner for KYC', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/shop-applications/mine').expect(401);
    const created = await request(server)
      .post('/api/shops')
      .auth(token(f.buyer), { type: 'bearer' })
      .send({
        name: 'Pending application Shop',
        logoUrl: 'https://public.test/logo.jpg',
      })
      .expect(201);
    shopId = created.body.data.id;
    expect(created.body.data.status).toBe('PENDING');
    await request(server).get(`/api/shops/${shopId}`).expect(404);
    await request(server)
      .patch(`/api/shops/${shopId}`)
      .set('X-Shop-Id', shopId)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ status: 'ACTIVE' })
      .expect(403);
    await request(server)
      .post(`/api/shops/${shopId}/application`)
      .auth(token(stranger), { type: 'bearer' })
      .send({ requestId: randomUUID() })
      .expect(404);
    const application = await request(server)
      .post(`/api/shops/${shopId}/application`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ requestId: randomUUID() })
      .expect(200);
    applicationId = application.body.data.id;
    version = application.body.data.version;
    await db.getRepository(PickupLocation).save({
      shopId,
      contactName: 'Owner pickup',
      phone: '0901234567',
      addressLine1: '12 Test street',
      provinceId: 201,
      districtId: 1485,
      districtName: 'District',
      provinceName: 'Province',
      wardCode: '001',
      wardName: 'Ward',
    });
    bankId = (
      await db.getRepository(ShopBankAccount).save({
        shopId,
        bankCode: 'TEST',
        accountNumber: '123456789',
        accountName: 'Different recipient allowed',
        confirmedBy: f.buyer.id,
        confirmedAt: new Date(),
        isDefault: true,
      })
    ).id;
  });
  it('keeps identity uploads private from Staff and rejects injected applicant fields', async () => {
    const server = app.getHttpServer();
    await db
      .getRepository(ShopMember)
      .save({ shopId, userId: stranger.id, memberRole: ShopMemberRole.STAFF });
    for (const slot of ['FRONT', 'BACK']) {
      const upload = await request(server)
        .post(`/api/shop-applications/${applicationId}/uploads`)
        .auth(token(f.buyer), { type: 'bearer' })
        .send({ slot, mimeType: 'image/jpeg', sizeBytes: 1024 })
        .expect(200);
      docs.push(upload.body.data.id);
      await request(server)
        .post(`/api/shop-application-documents/${upload.body.data.id}/complete`)
        .auth(token(f.buyer), { type: 'bearer' })
        .send({})
        .expect(200);
    }
    await request(server)
      .get(`/api/shop-application-documents/${docs[0]}/download`)
      .auth(token(stranger), { type: 'bearer' })
      .expect(404);
    await request(server)
      .get(`/api/shop-application-documents/${docs[0]}/download`)
      .auth(token(f.admin), { type: 'bearer' })
      .expect(404);
    const input = {
      requestId: randomUUID(),
      expectedVersion: version,
      identity: {
        documentType: 'NATIONAL_ID',
        documentNumber: '012345678901',
        fullName: 'Private Applicant',
        birthDate: '2000-01-01',
        expiresOn: '2099-01-01',
      },
      bankAccountId: bankId,
      documentIds: docs,
    };
    await request(server)
      .post(`/api/shop-applications/${applicationId}/submissions`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ ...input, applicantId: stranger.id })
      .expect(400);
    const submitted = await request(server)
      .post(`/api/shop-applications/${applicationId}/submissions`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send(input)
      .expect(200);
    version = submitted.body.data.version;
    expect(JSON.stringify(submitted.body)).not.toContain('storageKey');
    await request(server)
      .get(`/api/shop-application-documents/${docs[0]}/download`)
      .auth(token(f.admin), { type: 'bearer' })
      .expect(200);
  });
  it('requires explicit Admin identity review and keeps private notes and PII out of notices', async () => {
    const server = app.getHttpServer();
    const input = {
      requestId: randomUUID(),
      expectedVersion: version,
      outcome: 'APPROVED',
      reason: 'Original document information verified',
      identityCheckEvidence:
        'Identity matched and other approved accounts checked',
      identityMatchesApplicant: true,
      noOtherApprovedAccount: true,
      adminNote: 'PRIVATE ADMIN NOTE',
    };
    await request(server)
      .post(`/api/shop-applications/admin/${applicationId}/decisions`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send(input)
      .expect(403);
    await request(server)
      .post(`/api/shop-applications/admin/${applicationId}/decisions`)
      .auth(token(f.admin), { type: 'bearer' })
      .send({ ...input, identityMatchesApplicant: false })
      .expect(400);
    await request(server)
      .post(`/api/shop-applications/admin/${applicationId}/decisions`)
      .auth(token(f.admin), { type: 'bearer' })
      .send(input)
      .expect(200);
    const detail = await request(server)
      .get(`/api/shop-applications/${applicationId}`)
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(detail.body.data.state).toBe('APPROVED');
    expect(JSON.stringify(detail.body)).not.toContain('PRIVATE ADMIN NOTE');
    expect(detail.body.data).not.toHaveProperty('identityMatches');
    await request(server).get(`/api/shops/${shopId}`).expect(200);
    const notifications = await db
      .getRepository(Notification)
      .findBy({ sourceId: applicationId });
    expect(
      JSON.stringify(notifications.map((n) => [n.title, n.body])),
    ).not.toContain('012345678901');
    expect(await db.getRepository(NotificationEmailJob).count()).toBe(1);
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(doc.paths).toHaveProperty(
      '/api/shop-applications/admin/{id}/decisions',
    );
    expect(doc.paths).toHaveProperty(
      '/api/shop-application-documents/{id}/download',
    );
  });
  it('renews through private HTTP routes without bank/pickup resubmission and exposes a safe pause notice', async () => {
    const server = app.getHttpServer();
    await db
      .getRepository(Shop)
      .update(shopId, { identityManualRestriction: true });
    const publicShop = await request(server)
      .get(`/api/shops/${shopId}`)
      .expect(200);
    expect(publicShop.body.data.identitySalesPaused).toBe(true);
    expect(publicShop.body.data).not.toHaveProperty('identityExpiresOn');
    const memberships = await request(server)
      .get('/api/shops/me')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(
      memberships.body.data.find((m: { shopId: string }) => m.shopId === shopId)
        .shop.identitySalesPaused,
    ).toBe(true);
    const renewal = await request(server)
      .post(`/api/shops/${shopId}/identity-renewals`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ requestId: randomUUID() })
      .expect(200);
    const id = renewal.body.data.id;
    expect(renewal.body.data.kind).toBe('RENEWAL');
    const original = await request(server)
      .get(`/api/shop-applications/${applicationId}`)
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    const identity = {
      ...original.body.data.snapshot.identity,
      expiresOn: '2099-01-01',
    };
    const input = {
      requestId: randomUUID(),
      expectedVersion: renewal.body.data.version,
      identity,
      documentIds: docs,
    };
    await request(server)
      .post(`/api/shop-applications/${id}/renewal-submissions`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send(input)
      .expect(400);
    const documentIds = [];
    for (const slot of ['FRONT', 'BACK']) {
      const upload = await request(server)
        .post(`/api/shop-applications/${id}/uploads`)
        .auth(token(f.buyer), { type: 'bearer' })
        .send({ slot, mimeType: 'image/jpeg', sizeBytes: 1024 })
        .expect(200);
      await request(server)
        .post(`/api/shop-application-documents/${upload.body.data.id}/complete`)
        .auth(token(f.buyer), { type: 'bearer' })
        .expect(200);
      documentIds.push(upload.body.data.id);
    }
    const submitted = await request(server)
      .post(`/api/shop-applications/${id}/renewal-submissions`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ ...input, documentIds, requestId: randomUUID() })
      .expect(200);
    expect(submitted.body.data.snapshot.bank).toBeNull();
    expect(submitted.body.data.snapshot.pickup).toBeNull();
    await request(server)
      .get(`/api/shop-applications/${id}`)
      .auth(token(stranger), { type: 'bearer' })
      .expect(404);
    await request(server)
      .post(`/api/shop-applications/admin/${id}/decisions`)
      .auth(token(f.admin), { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        expectedVersion: submitted.body.data.version,
        outcome: 'APPROVED',
        reason: 'Renewed identity verified',
        identityCheckEvidence:
          'Same person and duplicate account review complete',
        identityMatchesApplicant: true,
        noOtherApprovedAccount: true,
        samePersonConfirmed: true,
      })
      .expect(200);
    const resumed = await request(server)
      .get(`/api/shops/${shopId}`)
      .expect(200);
    expect(resumed.body.data.identitySalesPaused).toBe(false);
  });
});
