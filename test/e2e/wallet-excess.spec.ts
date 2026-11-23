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
import { NotificationWorker } from '@/modules/notifications/notification.worker';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import type { User } from '@/modules/user/entities';
import {
  WalletAccount,
  WalletCredit,
} from '@/modules/wallet/entities/wallet.entity';
import { EXCESS_MOMO_CLIENT } from '@/modules/wallet/excess/constants/excess.constant';
import { ExcessCollection } from '@/modules/wallet/excess/entities/excess.entity';
import { WalletExcessWorker } from '@/modules/wallet/excess/wallet-excess.worker';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Wallet recovery HTTP', () => {
  let app: INestApplication;
  let db: DataSource;
  let f: Awaited<ReturnType<typeof adjudicationFixture>>;
  let stranger: User;
  let token: (user: User) => string;
  let id: string;
  let version: number;
  const client = {
    create: jest.fn(async () => ({
      resultCode: 0,
      payUrl: 'https://test.local/pay',
    })),
    verifyIpn: jest.fn((x) => {
      if (x.signature !== 'a'.repeat(64)) throw new Error('Invalid signature');
      return x;
    }),
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
      WalletExcessWorker,
    ])
      builder = builder.overrideProvider(worker).useValue({});
    const module = await builder
      .overrideProvider(EXCESS_MOMO_CLIENT)
      .useValue(client)
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
  it('requires current Admin to assess and privately exposes the case to its buyer', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/wallet/recoveries/mine').expect(401);
    const credit = await db.getRepository(WalletCredit).save({
      userId: f.buyer.id,
      orderId: f.order.id,
      mode: 'SIMULATION',
      amount: 100000,
    });
    await db.getRepository(WalletAccount).save({
      userId: f.buyer.id,
      simulationBalance: 0,
      simulationHeldBalance: 100000,
    });
    const input = {
      requestId: randomUUID(),
      sourceType: 'CANCELLATION',
      sourceId: credit.id,
      authorizedAmount: 60000,
      reason: 'Verified original refund discrepancy',
      evidence: 'Decision document and ledger entry',
    };
    await request(server)
      .post('/api/wallet/recoveries/admin')
      .auth(token(f.buyer), { type: 'bearer' })
      .send(input)
      .expect(403);
    await request(server)
      .post('/api/wallet/recoveries/admin')
      .auth(token(f.admin), { type: 'bearer' })
      .send({ ...input, buyerId: stranger.id })
      .expect(400);
    const result = await request(server)
      .post('/api/wallet/recoveries/admin')
      .auth(token(f.admin), { type: 'bearer' })
      .send(input)
      .expect(200);
    id = result.body.data.id;
    version = result.body.data.version;
    expect(result.body.data.outstanding).toBe(40000);
    expect(result.body.data.history[0]).not.toHaveProperty('actorId');
    await request(server)
      .get(`/api/wallet/recoveries/${id}`)
      .auth(token(stranger), { type: 'bearer' })
      .expect(404);
    const mine = await request(server)
      .get('/api/wallet/recoveries/mine')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(mine.body.data.items[0].id).toBe(id);
    await request(server)
      .get('/api/wallet/recoveries/mine?limit=101')
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(400);
  });
  it('routes only verified recovery callbacks and resolves inflight money through original-source refund', async () => {
    const server = app.getHttpServer();
    const payment = await request(server)
      .post('/api/wallet/recoveries/payments/momo')
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ requestId: randomUUID(), excessIds: [id], amount: 40000 })
      .expect(200);
    const object = await request(server)
      .post(`/api/wallet/recoveries/${id}/objections`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        reason: 'Original entitlement is the full amount',
        evidence: 'Decision document reference',
      })
      .expect(200);
    version = object.body.data.version;
    const payload = {
      partnerCode: 'test',
      orderId: payment.body.data.id,
      requestId: payment.body.data.id,
      amount: 40000,
      transId: 123456789,
      resultCode: 0,
      responseTime: Date.now(),
      message: 'success',
      orderInfo: 'Rewear wallet recovery ' + payment.body.data.id,
      orderType: 'momo_wallet',
      payType: 'qr',
      extraData: '',
      signature: 'b'.repeat(64),
    };
    await request(server)
      .post('/api/payments/momo/ipn')
      .send(payload)
      .expect(401);
    await request(server)
      .post('/api/payments/momo/ipn')
      .send({ ...payload, signature: 'a'.repeat(64) })
      .expect(204);
    expect(
      await db.getRepository(ExcessCollection).countBy({ excessId: id }),
    ).toBe(0);
    const corrected = await request(server)
      .post(`/api/wallet/recoveries/admin/${id}/corrections`)
      .auth(token(f.admin), { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        expectedVersion: version,
        authorizedAmount: 100000,
        reason: 'Confirmed original full entitlement',
        evidence: 'Original decision verified',
      })
      .expect(200);
    expect(corrected.body.data.reserved).toBe(0);
    expect(corrected.body.data.liability).toBe(0);
  });
  it('exports recovery, objection, Admin correction and payment schemas in OpenAPI', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(doc.paths).toHaveProperty(
      '/api/wallet/recoveries/admin/{id}/corrections',
    );
    expect(doc.paths).toHaveProperty('/api/wallet/recoveries/{id}/objections');
    expect(doc.paths).toHaveProperty('/api/wallet/recoveries/payments/momo');
  });
});
