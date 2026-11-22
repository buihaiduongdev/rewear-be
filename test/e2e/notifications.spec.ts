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
import { CoinRewardWorker } from '@/modules/coins/rewards/coin-reward.worker';
import { DisputeWorker } from '@/modules/dispute/dispute.worker';
import { MailService } from '@/modules/mail/mail.service';
import { NotificationProjector } from '@/modules/notifications/notification-projector.service';
import { NotificationWorker } from '@/modules/notifications/notification.worker';
import { publishNotification } from '@/modules/notifications/publish-notification';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import type { User } from '@/modules/user/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Central notification HTTP and OpenAPI', () => {
  let app: INestApplication;
  let db: DataSource;
  let f: Awaited<ReturnType<typeof adjudicationFixture>>;
  let token: (user: User) => string;
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
    builder = builder
      .overrideProvider(MailService)
      .useValue({ sendNotificationEmail: jest.fn(async () => {}) });
    const module = await builder.compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useLogger(false);
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    db = app.get(DataSource);
    f = await adjudicationFixture(db);
    token = (user) =>
      app
        .get(JwtService)
        .sign({ sub: user.id }, { secret: process.env.JWT_ACCESS_SECRET });
  });
  afterAll(async () => app?.close());
  it('enforces authentication, validates query and keeps private event metadata off responses', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/notifications').expect(401);
    await db.transaction((manager) =>
      publishNotification(manager, {
        key: randomUUID(),
        kind: 'COIN_ADJUSTMENT',
        sourceId: f.order.id,
        title: 'Xu thưởng được điều chỉnh',
        body: 'Mở lịch sử xu để xem chi tiết.',
        mode: 'SIMULATION',
        recipients: [{ userId: f.buyer.id, scope: 'USER' }],
      }),
    );
    await request(server)
      .get('/api/notifications?limit=101')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(400);
    await request(server)
      .get('/api/notifications?unreadOnly=wrong')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(400);
    const page = await request(server)
      .get('/api/notifications?unreadOnly=true')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    const item = page.body.data.items[0];
    expect(item).toMatchObject({ mode: 'SIMULATION', readAt: null });
    expect(item).not.toHaveProperty('eventKey');
    expect(item).not.toHaveProperty('recipientId');
    expect(item).not.toHaveProperty('permission');
    await request(server)
      .patch(`/api/notifications/${item.id}/read`)
      .auth(token(f.owner), { type: 'bearer' })
      .expect(404);
    await request(server)
      .patch(`/api/notifications/${item.id}/read`)
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    const count = await request(server)
      .get('/api/notifications/unread-count')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(count.body.data.count).toBe(0);
  });
  it('projects existing sources and marks only the current users visible inbox as read', async () => {
    await app.get(NotificationProjector).run();
    const server = app.getHttpServer();
    const buyer = await request(server)
      .get('/api/notifications')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(buyer.body.data.total).toBeGreaterThan(0);
    await request(server)
      .patch('/api/notifications/read-all')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    const other = await request(server)
      .get('/api/notifications/unread-count')
      .auth(token(f.owner), { type: 'bearer' })
      .expect(200);
    expect(other.body.data.count).toBeGreaterThan(0);
  });
  it('generates the documented inbox and read contracts', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(document.paths).toHaveProperty('/api/notifications');
    expect(document.paths).toHaveProperty('/api/notifications/unread-count');
    expect(document.paths).toHaveProperty('/api/notifications/{id}/read');
    expect(document.paths).toHaveProperty('/api/notifications/read-all');
  });
});
