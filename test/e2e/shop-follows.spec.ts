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
import { Category } from '@/modules/category/entities';
import { CoinRewardWorker } from '@/modules/coins/rewards/coin-reward.worker';
import { DisputeWorker } from '@/modules/dispute/dispute.worker';
import { MailService } from '@/modules/mail/mail.service';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import type { User } from '@/modules/user/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Follow Shop HTTP', () => {
  let app: INestApplication;
  let db: DataSource;
  let f: Awaited<ReturnType<typeof adjudicationFixture>>;
  let outsider: User;
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
      .useValue({ sendNotificationEmail: jest.fn() });
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
  it('requires login, validates input and scopes idempotent mutations to actor', async () => {
    const server = app.getHttpServer();
    const path = `/api/shop-follows/shops/${f.shop.id}`;
    await request(server).put(path).send({}).expect(401);
    await request(server)
      .put(path)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ userId: outsider.id })
      .expect(400);
    const first = await request(server)
      .put(path)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({})
      .expect(200);
    const replay = await request(server)
      .put(path)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({})
      .expect(200);
    expect(replay.body.data).toEqual(first.body.data);
    await request(server)
      .get('/api/shop-follows?limit=101')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(400);
    const list = await request(server)
      .get('/api/shop-follows')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(list.body.data.totalCount).toBe(1);
    expect(list.body.data.items[0]).not.toHaveProperty('userId');
    expect(list.body.data.items[0].shop).not.toHaveProperty('members');
    await request(server)
      .delete(path)
      .auth(token(outsider), { type: 'bearer' })
      .expect(200);
    const state = await request(server)
      .get(path)
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(state.body.data.following).toBe(true);
  });
  it('returns public followed-Shop products and removes them immediately after unfollow', async () => {
    const category = await db.manager.save(
      Category,
      db.manager.create(Category, {
        name: 'HTTP feed',
        slug: randomUUID(),
        isActive: true,
      }),
    );
    const product = await db.manager.save(
      Product,
      db.manager.create(Product, {
        shopId: f.shop.id,
        categoryId: category.id,
        title: 'Public item',
        price: 100000,
        status: ProductStatus.ACTIVE,
        publishedAt: new Date(Date.now() - 1000),
      }),
    );
    await db.manager.save(
      ProductModeration,
      db.manager.create(ProductModeration, {
        productId: product.id,
        status: ProductModerationStatus.APPROVED,
        version: 1,
      }),
    );
    const server = app.getHttpServer();
    const page = await request(server)
      .get('/api/shop-follows/products')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(page.body.data.items.map((item: { id: string }) => item.id)).toEqual(
      [product.id],
    );
    expect(page.body.data.items[0]).not.toHaveProperty('reservationId');
    await request(server)
      .delete(`/api/shop-follows/shops/${f.shop.id}`)
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    const empty = await request(server)
      .get('/api/shop-follows/products')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(empty.body.data.items).toHaveLength(0);
  });
  it('generates Follow Shop OpenAPI contracts', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(doc.paths).toHaveProperty('/api/shop-follows');
    expect(doc.paths).toHaveProperty('/api/shop-follows/products');
    expect(doc.paths).toHaveProperty('/api/shop-follows/shops/{shopId}');
  });
});
