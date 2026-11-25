import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import ms from 'ms';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { StorageService } from '@/infrastructure/storage';
import { AuthProvider } from '@/modules/auth/enums';
import { DisputeAdjudicationService } from '@/modules/dispute/dispute-adjudication.service';
import { DisputeReviewService } from '@/modules/dispute/dispute-review.service';
import { DisputeWorker } from '@/modules/dispute/dispute.worker';
import { DisputeFinalDecision } from '@/modules/dispute/entities/dispute-appeal.entity';
import { DisputeDecision } from '@/modules/dispute/entities/dispute-decision.entity';
import { DisputeEvidence } from '@/modules/dispute/entities/dispute.entity';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';
import { createPrivateMedia } from '../support/private-media';

describe('Appeal HTTP ownership, private evidence and final review', () => {
  let app: INestApplication;
  let db: DataSource;
  let f: Awaited<ReturnType<typeof adjudicationFixture>>;
  let decision: DisputeDecision,
    newFile: DisputeEvidence,
    reviewer: User,
    stranger: User;
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
      .overrideProvider(StorageService)
      .useValue({
        createDownloadUrl: async () => ({
          url: 'https://private.test/signed-read',
          headers: { 'If-Match': 'new-etag' },
          expiresAt: new Date(Date.now() + ms('5m')),
        }),
      })
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
    [reviewer, stranger] = await db.getRepository(User).save(
      [UserRole.ADMIN, UserRole.USER].map((role) => ({
        email: `${randomUUID()}@test.local`,
        fullName: 'Appeal reviewer',
        provider: AuthProvider.CREDENTIALS,
        status: UserStatus.ACTIVE,
        role,
      })),
    );
    const initial = app.get(DisputeAdjudicationService);
    decision = await initial.decide(f.admin.id, f.issue.id, {
      requestId: randomUUID(),
      reviewToken: (await initial.review(f.issue.id)).reviewToken,
      outcome: 'REQUIRE_RETURN',
      responsibility: 'SELLER',
      reason: 'Initial finding',
      evidenceAssessment: 'Initial submitted evidence reviewed',
    });
    const media = await createPrivateMedia(db, f.buyer.id);
    newFile = await db.getRepository(DisputeEvidence).save({
      orderId: f.order.id,
      uploadedById: f.buyer.id,
      mediaId: media.id,
      media,
      tags: ['ISSUE'],
    });
  });
  afterAll(async () => app?.close());
  const path = () => `/api/dispute-decisions/${decision.id}/appeals`;
  const data = () => ({
    requestId: randomUUID(),
    reason: 'New comparison evidence',
    evidenceIds: [newFile.id],
  });
  const reviewPath = () =>
    `/api/admin/dispute-decisions/${decision.id}/appeal-review`;
  it('requires authentication, party ownership and a structural appeal basis', async () => {
    await request(app.getHttpServer()).post(path()).send(data()).expect(401);
    await request(app.getHttpServer())
      .post(path())
      .auth(token(stranger), { type: 'bearer' })
      .send(data())
      .expect(403);
    await request(app.getHttpServer())
      .post(path())
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ ...data(), evidenceIds: [] })
      .expect(400);
    await request(app.getHttpServer())
      .post(path())
      .auth(token(f.buyer), { type: 'bearer' })
      .send({ ...data(), actorId: f.owner.id })
      .expect(400);
  });
  it('shares only submitted appeal evidence with the counterpart and hides storage/fingerprint fields', async () => {
    const download = `/api/dispute-evidence/${newFile.id}/download`;
    await request(app.getHttpServer())
      .get(download)
      .auth(token(f.owner), { type: 'bearer' })
      .expect(403);
    const submitted = await request(app.getHttpServer())
      .post(path())
      .auth(token(f.buyer), { type: 'bearer' })
      .send(data())
      .expect(200);
    expect(submitted.body.data.party).toBe('BUYER');
    expect(submitted.body.data).not.toHaveProperty('requestFingerprint');
    await request(app.getHttpServer())
      .get(download)
      .auth(token(f.owner), { type: 'bearer' })
      .expect(200);
    const detail = await request(app.getHttpServer())
      .get(`/api/orders/${f.order.id}/dispute`)
      .auth(token(f.owner), { type: 'bearer' })
      .expect(200);
    expect(detail.body.data.appeals).toHaveLength(1);
    expect(JSON.stringify(detail.body)).not.toContain(newFile.media.storageKey);
  });
  it('denies parties Admin appeal review/conclusion and cannot finalize before the common window', async () => {
    await request(app.getHttpServer())
      .get(reviewPath())
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(403);
    const review = await request(app.getHttpServer())
      .get(reviewPath())
      .auth(token(reviewer), { type: 'bearer' })
      .expect(200);
    const body = {
      requestId: randomUUID(),
      reviewToken: review.body.data.reviewToken,
      outcome: 'REJECT_CLAIM',
      responsibility: 'UNDETERMINED',
      reason: 'Final finding',
      evidenceAssessment: 'Both parties assessed',
    };
    const conclude = `/api/admin/dispute-decisions/${decision.id}/appeal-decision`;
    await request(app.getHttpServer())
      .post(conclude)
      .auth(token(f.owner), { type: 'bearer' })
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post(conclude)
      .auth(token(reviewer), { type: 'bearer' })
      .send(body)
      .expect(409);
  });
  it('finalizes after the window, exposes safe final record and denies another appeal', async () => {
    await db
      .getRepository(DisputeDecision)
      .update(decision.id, { appealUntil: new Date(Date.now() - ms('1h')) });
    await app.get(DisputeReviewService).refreshIssue(f.issue.id);
    const review = await request(app.getHttpServer())
      .get(reviewPath())
      .auth(token(reviewer), { type: 'bearer' })
      .expect(200);
    const body = {
      requestId: randomUUID(),
      reviewToken: review.body.data.reviewToken,
      outcome: 'REJECT_CLAIM',
      responsibility: 'UNDETERMINED',
      reason: 'Final finding',
      evidenceAssessment: 'Both parties assessed',
    };
    const conclude = `/api/admin/dispute-decisions/${decision.id}/appeal-decision`;
    const final = await request(app.getHttpServer())
      .post(conclude)
      .auth(token(reviewer), { type: 'bearer' })
      .send(body)
      .expect(200);
    expect(final.body.data.source).toBe('APPEAL_REVIEW');
    expect(final.body.data).not.toHaveProperty('requestFingerprint');
    expect(final.body.data).not.toHaveProperty('reviewToken');
    await request(app.getHttpServer())
      .post(conclude)
      .auth(token(reviewer), { type: 'bearer' })
      .send(body)
      .expect(200);
    expect(
      await db
        .getRepository(DisputeFinalDecision)
        .countBy({ decisionId: decision.id }),
    ).toBe(1);
    await request(app.getHttpServer())
      .post(path())
      .auth(token(f.owner), { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        reason: 'Again',
        specificError: 'Another claim',
        evidenceIds: [],
      })
      .expect(409);
  });
});
