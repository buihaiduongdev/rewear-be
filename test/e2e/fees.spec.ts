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
import { DisputeWorker } from '@/modules/dispute/dispute.worker';
import { FeeAssessment } from '@/modules/fees/entities';
import { FeeWorker } from '@/modules/fees/fee.worker';
import { FeePaymentWorker } from '@/modules/fees/payments/fee-payment.worker';
import { FeeSettlementWorker } from '@/modules/fees/settlement/fee-settlement.worker';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import { ShopPayoutWorker } from '@/modules/shop-finance/payouts/shop-payout.worker';
import { User } from '@/modules/user/entities';
import { WalletAccount, WalletCredit } from '@/modules/wallet/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Fee HTTP privacy, source payments and documented contracts', () => {
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
      FeeWorker,
      FeeSettlementWorker,
      FeePaymentWorker,
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
  it('allows only Admin to publish fee terms and only the actual active Owner to accept Shop terms', async () => {
    const policy = {
      conditions: [
        {
          kind: 'CANCELLATION',
          text: 'Actual verified carrier cancellation costs, no arbitrary penalty, prior party acceptance required.',
        },
      ],
    };
    await request(app.getHttpServer())
      .post('/api/admin/fee-policies')
      .auth(token(f.owner), { type: 'bearer' })
      .send(policy)
      .expect(403);
    const published = await request(app.getHttpServer())
      .post('/api/admin/fee-policies')
      .auth(token(f.admin), { type: 'bearer' })
      .send(policy)
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/fee-policies/current')
      .expect(200);
    const payload = { policyId: published.body.data.id, accepted: true };
    await request(app.getHttpServer())
      .post(`/api/shops/${f.shop.id}/fee-policy-acceptance`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send(payload)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/shops/${f.shop.id}/fee-policy-acceptance`)
      .auth(token(f.owner), { type: 'bearer' })
      .send(payload)
      .expect(201);
  });
  it('keeps fee evidence/private source identifiers out of party views and does not permit another person to pay the wallet', async () => {
    const fee = await db.getRepository(FeeAssessment).save(
      db.getRepository(FeeAssessment).create({
        orderId: f.order.id,
        shopId: f.shop.id,
        buyerId: f.buyer.id,
        party: 'BUYER',
        mode: 'SIMULATION',
        kind: 'CANCELLATION',
        sourceId: randomUUID(),
        waybillId: randomUUID(),
        invoiceReference: 'SECRET-INTERNAL-INVOICE',
        invoiceLine: '1',
        amount: 5000,
        payableAmount: 5000,
        status: 'ACTIVE',
        reason: 'Verified actual cancellation fee',
        evidence: 'SECRET-PRIVATE-STATEMENT',
        disclosureVerifiedAt: new Date(),
        notifiedAt: new Date(),
        dueAt: new Date(Date.now() + 86400000),
        objectionUsed: false,
      }),
    );
    const path = `/api/fees/${fee.id}`;
    await request(app.getHttpServer()).get(path).expect(401);
    await request(app.getHttpServer())
      .get(path)
      .auth(token(f.owner), { type: 'bearer' })
      .expect(403);
    const read = await request(app.getHttpServer())
      .get(path)
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(read.body.data.outstanding).toBe(5000);
    expect(JSON.stringify(read.body)).not.toContain('SECRET');
    await request(app.getHttpServer())
      .post(`${path}/payments/wallet`)
      .auth(token(f.owner), { type: 'bearer' })
      .send({ requestId: randomUUID(), expectedAmount: 5000 })
      .expect(404);
    await db
      .getRepository(WalletAccount)
      .save({ userId: f.buyer.id, balance: 0, simulationBalance: 10000 });
    await db.getRepository(WalletCredit).save({
      userId: f.buyer.id,
      orderId: f.order.id,
      mode: 'SIMULATION',
      amount: 10000,
      reason: 'ORDER_CANCELLED',
    });
    await request(app.getHttpServer())
      .post(`${path}/payments/wallet`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ requestId: randomUUID(), expectedAmount: 5000 })
      .expect(201);
    const paid = await request(app.getHttpServer())
      .get(path)
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(paid.body.data.outstanding).toBe(0);
    expect(paid.body.data.collections).toHaveLength(1);
    expect(JSON.stringify(paid.body)).not.toContain('SECRET');
  });
  it('generates OpenAPI with fee policies, invoices, wallet/PayOS settlement and correction routes', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(
      document.paths['/api/fees/{id}/payments/wallet']?.post,
    ).toBeDefined();
    expect(document.paths['/api/fee-payments/payos']?.post).toBeDefined();
    expect(document.paths['/api/fees/{id}/corrections']?.post).toBeDefined();
    expect(document.paths['/api/admin/fee-policies']?.post).toBeDefined();
  });
});
