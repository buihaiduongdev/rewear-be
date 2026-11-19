import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { DisputeAdjudicationService } from '@/modules/dispute/dispute-adjudication.service';
import { DisputeRefundService } from '@/modules/dispute/dispute-refund.service';
import { DisputeReviewService } from '@/modules/dispute/dispute-review.service';
import { DisputeWorker } from '@/modules/dispute/dispute.worker';
import { DisputeFinalDecision } from '@/modules/dispute/entities/dispute-appeal.entity';
import { DisputeDecision } from '@/modules/dispute/entities/dispute-decision.entity';
import {
  DisputeRefund,
  DisputeRefundIncidentUpdate,
} from '@/modules/dispute/entities/dispute-refund.entity';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import { User } from '@/modules/user/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Dispute refund HTTP permissions, exact consent and safe history', () => {
  let app: INestApplication, db: DataSource;
  let f: Awaited<ReturnType<typeof adjudicationFixture>>;
  let final: DisputeFinalDecision;
  let token: (user: User) => string;
  beforeAll(async () => {
    const database = await createTestDatabase();
    await database.destroy();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OrderWorker)
      .useValue({})
      .overrideProvider(OrderSettlementWorker)
      .useValue({})
      .overrideProvider(ShipmentWorker)
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
    const service = app.get(DisputeAdjudicationService);
    const decision = await service.decide(f.admin.id, f.issue.id, {
      requestId: randomUUID(),
      reviewToken: (await service.review(f.issue.id)).reviewToken,
      outcome: 'UPHOLD_CLAIM',
      responsibility: 'SELLER',
      reason: 'Partial remedy subject to both consents',
      evidenceAssessment: 'Both parties proof reviewed',
      refundPlan: { amount: 40000, condition: 'PARTIAL_AGREEMENT' },
    });
    await db
      .getRepository(DisputeDecision)
      .update(decision.id, { appealUntil: new Date(Date.now() - 1000) });
    await app.get(DisputeReviewService).refreshIssue(f.issue.id);
    final = await db
      .getRepository(DisputeFinalDecision)
      .findOneByOrFail({ decisionId: decision.id });
  });
  afterAll(async () => app?.close());
  const path = () => `/api/dispute-final-decisions/${final.id}/refund`;
  it('requires authentication and order ownership for financial details', async () => {
    await request(app.getHttpServer()).get(path()).expect(401);
    const stranger = await db.getRepository(User).save({
      ...f.buyer,
      id: randomUUID(),
      email: `${randomUUID()}@test.local`,
    });
    await request(app.getHttpServer())
      .get(path())
      .auth(token(stranger), { type: 'bearer' })
      .expect(403);
    const response = await request(app.getHttpServer())
      .get(path())
      .auth(token(f.owner), { type: 'bearer' })
      .expect(200);
    expect(response.body.data).toMatchObject({
      refundPlan: { amount: 40000, condition: 'PARTIAL_AGREEMENT' },
      approvedSellerDebit: 38800,
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /requestFingerprint|planFingerprint|storageKey|eTag|basis/,
    );
  });
  it('requires Admin for refresh and incident operations; buyer cannot mark return/payment ready', async () => {
    await request(app.getHttpServer())
      .post(`/api/admin/dispute-final-decisions/${final.id}/refund/refresh`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({})
      .expect(403);
    const response = await request(app.getHttpServer())
      .get(path())
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .post(path() + '/consents')
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ planToken: response.body.data.planToken, ready: true })
      .expect(400);
  });
  it('records exact-plan consent idempotently, leaves money pending without verified payment', async () => {
    const body = { planToken: app.get(DisputeRefundService).planToken(final) };
    for (const user of [f.buyer, f.owner, f.owner])
      await request(app.getHttpServer())
        .post(path() + '/consents')
        .auth(token(user), { type: 'bearer' })
        .send(body)
        .expect(200);
    const response = await request(app.getHttpServer())
      .post(`/api/admin/dispute-final-decisions/${final.id}/refund/refresh`)
      .auth(token(f.admin), { type: 'bearer' })
      .send({})
      .expect(200);
    expect(response.body.data).toMatchObject({
      status: 'PENDING',
      blockedReason: 'PAYMENT_UNVERIFIED',
    });
  });
  it('records substantive incident responses with replay protection and hides private fingerprints', async () => {
    const refund = await db
      .getRepository(DisputeRefund)
      .findOneByOrFail({ finalDecisionId: final.id });
    await db.getRepository(DisputeRefund).update(refund.id, {
      alertedAt: new Date(),
      responseDueAt: new Date(Date.now() + 14400000),
    });
    const path = `/api/admin/dispute-refunds/${refund.id}/incident-updates`;
    const body = {
      requestId: randomUUID(),
      statusNote: 'Verified wallet write did not occur',
      stepsTaken:
        'Checked transaction journal; retry after source verification',
      nextUpdateAt: new Date(Date.now() + 3600000).toISOString(),
    };
    await request(app.getHttpServer())
      .post(path)
      .auth(token(f.owner), { type: 'bearer' })
      .send(body)
      .expect(403);
    const response = await request(app.getHttpServer())
      .post(path)
      .auth(token(f.admin), { type: 'bearer' })
      .send(body)
      .expect(200);
    await request(app.getHttpServer())
      .post(path)
      .auth(token(f.admin), { type: 'bearer' })
      .send(body)
      .expect(200);
    await request(app.getHttpServer())
      .post(path)
      .auth(token(f.admin), { type: 'bearer' })
      .send({ ...body, statusNote: 'Changed response' })
      .expect(409);
    expect(
      await db
        .getRepository(DisputeRefundIncidentUpdate)
        .countBy({ refundId: refund.id }),
    ).toBe(1);
    expect(JSON.stringify(response.body)).not.toContain('requestFingerprint');
  });
});
