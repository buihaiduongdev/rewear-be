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
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { DisputeWorker } from '@/modules/dispute/dispute.worker';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import { ShopBankAccount } from '@/modules/shop-finance/payouts/entities/shop-bank-account.entity';
import { ShopPayoutWorker } from '@/modules/shop-finance/payouts/shop-payout.worker';
import { User } from '@/modules/user/entities';
import { WalletCheckoutHold } from '@/modules/wallet/checkout/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Wallet and payout HTTP access and API contracts', () => {
  let app: INestApplication, db: DataSource;
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
      ShopPayoutWorker,
    ])
      builder = builder.overrideProvider(worker).useValue({});
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
  it('never exposes another buyers wallet reservation and requires login', async () => {
    const checkout = await db.getRepository(Checkout).save({
      buyerId: f.buyer.id,
      requestId: randomUUID(),
      addressId: randomUUID(),
      requestedProductIds: [],
      address: {} as Checkout['address'],
      status: 'CANCELLED',
    });
    const hold = await db.getRepository(WalletCheckoutHold).save({
      checkoutId: checkout.id,
      buyerId: f.buyer.id,
      requestId: randomUUID(),
      mode: 'EVIDENCE',
      state: 'RELEASED',
      amount: 100,
      orders: [],
      expiresAt: new Date(),
      releasedAt: new Date(),
    });
    const url = '/api/wallet/checkouts/' + hold.id;
    await request(app.getHttpServer()).get(url).expect(401);
    await request(app.getHttpServer())
      .get(url)
      .auth(token(f.owner), { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(url)
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
  });
  it('allows only the Shop Owner to read bank profiles and only Admin to handle bank results', async () => {
    await db.getRepository(ShopBankAccount).save({
      shopId: f.shop.id,
      bankCode: 'VCB',
      accountNumber: '12345678',
      accountName: 'Private recipient',
      confirmedBy: f.owner.id,
      confirmedAt: new Date(),
    });
    const url = `/api/shops/${f.shop.id}/finance/payouts`;
    await request(app.getHttpServer())
      .get(url)
      .set('X-Shop-Id', f.shop.id)
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(403);
    const result = await request(app.getHttpServer())
      .get(url)
      .set('X-Shop-Id', f.shop.id)
      .auth(token(f.owner), { type: 'bearer' })
      .expect(200);
    expect(JSON.stringify(result.body)).toContain('12345678');
    await request(app.getHttpServer())
      .get('/api/admin/shop-payouts')
      .auth(token(f.owner), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/admin/shop-payouts')
      .auth(token(f.admin), { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/admin/shop-payouts/${randomUUID()}/success`)
      .auth(token(f.owner), { type: 'bearer' })
      .send({})
      .expect(403);
  });
  it('documents the new routes and validates wallet mode and bank-owner confirmation', async () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(
      document.paths['/api/checkouts/{id}/payments/wallet']?.post,
    ).toBeDefined();
    expect(
      document.paths['/api/shops/{shopId}/finance/payouts']?.post,
    ).toBeDefined();
    await request(app.getHttpServer())
      .post(`/api/checkouts/${randomUUID()}/payments/wallet`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ requestId: randomUUID(), expectedTotal: 100, mode: 'REAL' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/shops/${f.shop.id}/finance/bank-accounts`)
      .set('X-Shop-Id', f.shop.id)
      .auth(token(f.owner), { type: 'bearer' })
      .send({
        bankCode: 'VCB',
        accountNumber: '12345678',
        accountName: 'Recipient',
        ownerConfirmed: false,
      })
      .expect(400);
  });
});
