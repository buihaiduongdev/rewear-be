import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { DisputeWorker } from '@/modules/dispute/dispute.worker';
import { DisputeDecision } from '@/modules/dispute/entities/dispute-decision.entity';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import type { User } from '@/modules/user/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Admin issue adjudication HTTP', () => {
  let app: INestApplication;
  let db: DataSource;
  let f: Awaited<ReturnType<typeof adjudicationFixture>>;
  let token: (user: User) => string;
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
      .compile();
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
  const reviewPath = () => `/api/admin/dispute-issues/${f.issue.id}/review`;
  const decisionPath = () => `/api/admin/dispute-issues/${f.issue.id}/decision`;
  const data = (reviewToken: string) => ({
    requestId: randomUUID(),
    reviewToken,
    outcome: 'REQUIRE_RETURN',
    responsibility: 'SELLER',
    reason: 'Different item from listing',
    evidenceAssessment: 'Buyer image compared to listing and seller evidence',
  });

  it('requires authentication and denies buyer/Owner administrative review and decisions', async () => {
    await request(app.getHttpServer()).get(reviewPath()).expect(401);
    for (const user of [f.buyer, f.owner]) {
      await request(app.getHttpServer())
        .get(reviewPath())
        .auth(token(user), { type: 'bearer' })
        .expect(403);
      await request(app.getHttpServer())
        .post(decisionPath())
        .auth(token(user), { type: 'bearer' })
        .send(data('0'.repeat(64)))
        .expect(403);
    }
  });
  it('validates UUID, pagination and strict decision body', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/dispute-issues/not-uuid/review')
      .auth(token(f.admin), { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .get(`${reviewPath()}?offset=-1`)
      .auth(token(f.admin), { type: 'bearer' })
      .expect(400);
    const input = data('0'.repeat(64));
    for (const invalid of [
      { ...input, refundAmount: 1 },
      { ...input, evidenceAssessment: '' },
      { ...input, outcome: 'FORCE_PARTIAL_REFUND' },
    ])
      await request(app.getHttpServer())
        .post(decisionPath())
        .auth(token(f.admin), { type: 'bearer' })
        .send(invalid)
        .expect(400);
  });
  it('provides snapshot token and safe evidence/message views without bucket details', async () => {
    const review = await request(app.getHttpServer())
      .get(reviewPath())
      .auth(token(f.admin), { type: 'bearer' })
      .expect(200);
    expect(review.body.data.reviewToken).toMatch(/^[a-f0-9]{64}$/);
    expect(review.body.data.order.itemPrice).toBe(100001);
    expect(review.body.data.evidence).toHaveLength(1);
    expect(JSON.stringify(review.body)).not.toContain(
      f.evidence.media.storageKey,
    );
  });
  it('records initial decision and publishes reason/deadline without private fingerprints or basis', async () => {
    const review = await request(app.getHttpServer())
      .get(reviewPath())
      .auth(token(f.admin), { type: 'bearer' })
      .expect(200);
    const input = data(review.body.data.reviewToken);
    const response = await request(app.getHttpServer())
      .post(decisionPath())
      .auth(token(f.admin), { type: 'bearer' })
      .send(input)
      .expect(200);
    expect(response.body.data.outcome).toBe('REQUIRE_RETURN');
    expect(response.body.data.appealUntil).not.toBeNull();
    expect(response.body.data).not.toHaveProperty('requestFingerprint');
    expect(response.body.data).not.toHaveProperty('basis');
    const replay = await request(app.getHttpServer())
      .post(decisionPath())
      .auth(token(f.admin), { type: 'bearer' })
      .send(input)
      .expect(200);
    expect(replay.body.data.id).toBe(response.body.data.id);
    expect(
      await db.getRepository(DisputeDecision).countBy({ issueId: f.issue.id }),
    ).toBe(1);
    const detail = await request(app.getHttpServer())
      .get(`/api/orders/${f.order.id}/dispute`)
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(detail.body.data.decisions[0].reason).toBe(input.reason);
    expect(detail.body.data.issues[0].status).toBe('AWAITING_APPEAL');
    expect(JSON.stringify(detail.body)).not.toContain(
      f.evidence.media.storageKey,
    );
    expect(detail.body.data.decisions[0]).not.toHaveProperty('reviewToken');
  });
});
