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
import { NotificationService } from '@/modules/notifications/notification.service';
import { NotificationWorker } from '@/modules/notifications/notification.worker';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import type { User } from '@/modules/user/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Buyer–Shop chat HTTP', () => {
  let app: INestApplication;
  let db: DataSource;
  let f: Awaited<ReturnType<typeof adjudicationFixture>>;
  let outsider: User;
  let token: (user: User) => string;
  let conversationId: string;
  let mediaId: string;
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
      contentType: 'video/mp4',
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
    builder = builder.overrideProvider(StorageService).useValue(storage);
    const module = await builder.compile();
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
  it('authenticates, creates a unique thread and rejects impersonation and cross-user access', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/chat/conversations')
      .send({ shopId: f.shop.id })
      .expect(401);
    const opened = await request(server)
      .post('/api/chat/conversations')
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ shopId: f.shop.id })
      .expect(200);
    conversationId = opened.body.data.id;
    const again = await request(server)
      .post('/api/chat/conversations')
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ shopId: f.shop.id })
      .expect(200);
    expect(again.body.data.id).toBe(conversationId);
    await request(server)
      .get(`/api/chat/conversations/${conversationId}/messages`)
      .auth(token(outsider), { type: 'bearer' })
      .expect(403);
    await request(server)
      .post(`/api/chat/conversations/${conversationId}/messages`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ text: 'fake', senderSide: 'SHOP' })
      .expect(400);
    const sent = await request(server)
      .post(`/api/chat/conversations/${conversationId}/messages`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ text: 'Còn hàng không?' })
      .expect(200);
    expect(sent.body.data.senderId).toBe(f.buyer.id);
    expect((await app.get(NotificationService).unread(f.owner.id)).count).toBe(
      1,
    );
  });
  it('supports media uploads, authorized signing and evidence import without leaking keys', async () => {
    const server = app.getHttpServer();
    const base = `/api/chat/conversations/${conversationId}`;
    const upload = await request(server)
      .post('/api/media/upload-ticket')
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ mimeType: 'video/mp4', sizeBytes: 1024, visibility: 'private' })
      .expect(201);
    mediaId = upload.body.data.id;
    await request(server)
      .get(`/api/chat/media/${mediaId}/download`)
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(404);
    const sent = await request(server)
      .post(`${base}/messages`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ mediaIds: [mediaId] })
      .expect(200);
    expect(JSON.stringify(sent.body)).not.toContain('storageKey');
    await request(server)
      .get(`/api/chat/media/${mediaId}/download`)
      .auth(token(outsider), { type: 'bearer' })
      .expect(403);
    await request(server)
      .get(`/api/chat/media/${mediaId}/download`)
      .auth(token(f.owner), { type: 'bearer' })
      .expect(200);
    const imported = await request(server)
      .post(`/api/chat/media/${mediaId}/dispute-evidence`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ orderId: f.order.id, tags: ['UNBOX'] })
      .expect(200);
    expect(imported.body.data.mimeType).toBe('video/mp4');
    expect(imported.body.data).not.toHaveProperty('storageKey');
  });
  it('marks read, lists only own conversations and generates OpenAPI', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post(`/api/chat/conversations/${conversationId}/read`)
      .auth(token(f.owner), { type: 'bearer' })
      .expect(200);
    const page = await request(server)
      .get('/api/chat/conversations')
      .auth(token(f.owner), { type: 'bearer' })
      .expect(200);
    expect(page.body.data.items[0].unreadCount).toBe(0);
    const other = await request(server)
      .get('/api/chat/conversations')
      .auth(token(outsider), { type: 'bearer' })
      .expect(200);
    expect(other.body.data.total).toBe(0);
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(doc.paths).toHaveProperty('/api/chat/conversations');
    expect(doc.paths).toHaveProperty('/api/chat/conversations/{id}/messages');
    expect(doc.paths).toHaveProperty('/api/chat/media/{id}/dispute-evidence');
  });
});
