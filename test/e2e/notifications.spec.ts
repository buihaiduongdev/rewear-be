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
import { CoinRewardWorker } from '@/modules/coins/coin-reward.worker';
import { DisputeWorker } from '@/modules/dispute/dispute.worker';
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { MailService } from '@/modules/mail/mail.service';
import { NotificationEventProcessor } from '@/modules/notifications/notification-event.processor';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import type { User } from '@/modules/user/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Central notification HTTP, SSE and OpenAPI', () => {
  let app: INestApplication;
  let db: DataSource;
  let f: Awaited<ReturnType<typeof adjudicationFixture>>;
  let token: (user: User) => string;

  beforeAll(async () => {
    const database = await createTestDatabase();
    await database.destroy();
    let builder = Test.createTestingModule({ imports: [AppModule] });
    for (const worker of [
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

  it('enforces auth, paginates with nestjs-paginate, marks read, and documents OpenAPI endpoints', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/notifications').expect(401);
    await request(server).get('/api/notifications/stream').expect(401);

    const processor = app.get(NotificationEventProcessor);
    await processor.handleEvent({
      eventId: randomUUID(),
      eventType: EVENT_TYPES.ORDER_CREATED,
      resourceId: f.order.id,
      payload: {
        orderId: f.order.id,
        buyerId: f.buyer.id,
        shopId: f.shop.id,
      },
    });

    const page = await request(server)
      .get('/api/notifications?filter.isRead=$eq:false')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);

    expect(page.body.data.data).toHaveLength(1);
    const item = page.body.data.data[0];
    expect(item).toMatchObject({
      recipientId: f.buyer.id,
      type: EVENT_TYPES.ORDER_CREATED,
      entityType: 'order',
      entityId: f.order.id,
      isRead: false,
    });

    const unread = await request(server)
      .get('/api/notifications/unread-count')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(unread.body.data.count).toBe(1);

    await request(server)
      .patch(`/api/notifications/${item.id}/read`)
      .auth(token(f.admin), { type: 'bearer' })
      .expect(404);

    const readOne = await request(server)
      .patch(`/api/notifications/${item.id}/read`)
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(readOne.body.data.isRead).toBe(true);

    const readAll = await request(server)
      .patch('/api/notifications/read-all')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(readAll.body.data.updatedCount).toBe(0);

    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(doc.paths).toHaveProperty('/api/notifications');
    expect(doc.paths).toHaveProperty('/api/notifications/stream');
    expect(doc.paths).toHaveProperty('/api/notifications/unread-count');
    expect(doc.paths).toHaveProperty('/api/notifications/read-all');
    expect(doc.paths).toHaveProperty('/api/notifications/{id}/read');
  });
});
