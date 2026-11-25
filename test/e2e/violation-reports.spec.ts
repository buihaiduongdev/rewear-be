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
import { StorageService } from '@/infrastructure/storage';
import { CoinRewardWorker } from '@/modules/coins/rewards/coin-reward.worker';
import { DisputeWorker } from '@/modules/dispute/dispute.worker';
import { NotificationWorker } from '@/modules/notifications/notification.worker';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import type { User } from '@/modules/user/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Violation reports HTTP', () => {
  let app: INestApplication;
  let db: DataSource;
  let f: Awaited<ReturnType<typeof adjudicationFixture>>;
  let outsider: User;
  let token: (user: User) => string;
  let reportId: string;
  let evidenceId: string;
  let version: number;
  const storage = {
    assertConfigured: jest.fn(),
    createUploadTicket: jest.fn(async () => ({
      key: `uploads/${randomUUID()}.jpg`,
      uploadUrl: 'https://private.test/upload',
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
    ])
      builder = builder.overrideProvider(worker).useValue({});
    const module = await builder
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
    f = await adjudicationFixture(db);
    outsider = (await adjudicationFixture(db)).buyer;
    token = (user) =>
      app
        .get(JwtService)
        .sign({ sub: user.id }, { secret: process.env.JWT_ACCESS_SECRET });
  });
  afterAll(async () => app?.close());
  it('requires login and keeps report/photo data private to reporter and Admin', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/reports/mine').expect(401);
    const upload = await request(server)
      .post('/api/media/upload-ticket')
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ mimeType: 'image/jpeg', sizeBytes: 1024, visibility: 'private' })
      .expect(201);
    const evidence = await request(server)
      .post('/api/reports/evidence')
      .auth(token(f.buyer), { type: 'bearer' })
      .send({
        targetType: 'SHOP',
        targetId: f.shop.id,
        mediaId: upload.body.data.id,
      })
      .expect(200);
    evidenceId = evidence.body.data.id;
    const input = {
      requestId: randomUUID(),
      targetType: 'SHOP',
      targetId: f.shop.id,
      reason: 'FRAUD',
      description: 'Báo cáo hành vi cần kiểm tra xác minh',
      evidenceIds: [evidenceId],
    };
    await request(server)
      .post('/api/reports')
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ ...input, reporterId: outsider.id })
      .expect(400);
    const result = await request(server)
      .post('/api/reports')
      .auth(token(f.buyer), { type: 'bearer' })
      .send(input)
      .expect(200);
    reportId = result.body.data.id;
    version = result.body.data.version;
    expect(result.body.data).not.toHaveProperty('reporterId');
    expect(result.body.data).not.toHaveProperty('fingerprint');
    expect(JSON.stringify(result.body)).not.toContain('storageKey');
    const replay = await request(server)
      .post('/api/reports')
      .auth(token(f.buyer), { type: 'bearer' })
      .send(input)
      .expect(200);
    expect(replay.body.data.id).toBe(reportId);
    await request(server)
      .get(`/api/reports/${reportId}`)
      .auth(token(outsider), { type: 'bearer' })
      .expect(404);
    await request(server)
      .get(`/api/reports/${reportId}`)
      .auth(token(f.owner), { type: 'bearer' })
      .expect(404);
    await request(server)
      .get(`/api/reports/evidence/${evidenceId}/download`)
      .auth(token(f.owner), { type: 'bearer' })
      .expect(404);
    await request(server)
      .get(`/api/reports/evidence/${evidenceId}/download`)
      .auth(token(f.admin), { type: 'bearer' })
      .expect(200);
  });
  it('checks Admin authority and version and withholds internal notes from reporter responses', async () => {
    const server = app.getHttpServer();
    await request(server)
      .get('/api/reports/admin')
      .auth(token(f.owner), { type: 'bearer' })
      .expect(403);
    const claim = await request(server)
      .post(`/api/reports/admin/${reportId}/claim`)
      .auth(token(f.admin), { type: 'bearer' })
      .send({ requestId: randomUUID(), expectedVersion: version })
      .expect(200);
    version = claim.body.data.version;
    await request(server)
      .post(`/api/reports/admin/${reportId}/resolve`)
      .auth(token(f.admin), { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        expectedVersion: version - 1,
        outcome: 'DISMISSED',
        action: 'NONE',
        reason: 'Chưa đủ căn cứ vi phạm',
      })
      .expect(409);
    const result = await request(server)
      .post(`/api/reports/admin/${reportId}/resolve`)
      .auth(token(f.admin), { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        expectedVersion: version,
        outcome: 'DISMISSED',
        action: 'NONE',
        reason: 'Chưa đủ căn cứ vi phạm',
        adminNote: 'SECRET INTERNAL NOTE',
      })
      .expect(200);
    expect(result.body.data.adminNote).toBe('SECRET INTERNAL NOTE');
    const mine = await request(server)
      .get(`/api/reports/${reportId}`)
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(JSON.stringify(mine.body)).not.toContain('SECRET INTERNAL NOTE');
    expect(mine.body.data.status).toBe('RESOLVED');
    const queue = await request(server)
      .get('/api/reports/admin?status=RESOLVED')
      .auth(token(f.admin), { type: 'bearer' })
      .expect(200);
    expect(queue.body.data.items[0]).not.toHaveProperty('adminNote');
  });
  it('validates queue filters and generates the report/evidence/Admin OpenAPI routes', async () => {
    await request(app.getHttpServer())
      .get('/api/reports/mine?limit=101')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(400);
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(doc.paths).toHaveProperty('/api/reports');
    expect(doc.paths).toHaveProperty('/api/reports/admin/{id}/resolve');
    expect(doc.paths).toHaveProperty('/api/reports/evidence/{id}/download');
  });
});
