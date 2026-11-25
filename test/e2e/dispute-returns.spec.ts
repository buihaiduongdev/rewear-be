import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { StorageService } from '@/infrastructure/storage';
import { DisputeWorker } from '@/modules/dispute/dispute.worker';
import { OrderSettlementWorker } from '@/modules/order/order-settlement.worker';
import { OrderWorker } from '@/modules/order/order.worker';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';
import { User } from '@/modules/user/entities';

import { createTestDatabase } from '../support/database';
import {
  disputeReturnFixture,
  evidenceForReturn,
  labelForReturn,
} from '../support/dispute-return-fixture';

describe('Return HTTP ownership and submitted-proof privacy', () => {
  let app: INestApplication,
    db: DataSource,
    f: Awaited<ReturnType<typeof disputeReturnFixture>>;
  let label: Awaited<ReturnType<typeof labelForReturn>>,
    proof: Awaited<ReturnType<typeof evidenceForReturn>>,
    stranger: User;
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
      .overrideProvider(StorageService)
      .useValue({
        createDownloadUrl: async () => ({
          url: 'https://private.test/signed-return-proof',
          headers: { 'If-Match': 'private-etag' },
          expiresAt: new Date(Date.now() + 300000),
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
    f = await disputeReturnFixture(db);
    label = await labelForReturn(f);
    proof = await evidenceForReturn(f);
    stranger = await db.getRepository(User).save({
      ...f.buyer,
      id: randomUUID(),
      email: `${randomUUID()}@test.local`,
    });
    token = (user) =>
      app
        .get(JwtService)
        .sign({ sub: user.id }, { secret: process.env.JWT_ACCESS_SECRET });
  });
  afterAll(async () => app?.close());
  const path = () => `/api/dispute-returns/${label.id}`;
  it('requires authentication and current order ownership, returns the linked return in refund detail', async () => {
    await request(app.getHttpServer()).get(path()).expect(401);
    await request(app.getHttpServer())
      .get(path())
      .auth(token(stranger), { type: 'bearer' })
      .expect(403);
    const response = await request(app.getHttpServer())
      .get(`/api/dispute-final-decisions/${f.final.id}/refund`)
      .auth(token(f.buyer), { type: 'bearer' })
      .expect(200);
    expect(response.body.data.returnCase).toMatchObject({
      id: label.id,
      state: 'AWAITING_HANDOVER',
    });
  });
  it('keeps unsubmitted packing evidence private and shares submitted proof with counterpart only', async () => {
    await request(app.getHttpServer())
      .get(`/api/dispute-evidence/${proof.id}/download`)
      .auth(token(f.owner), { type: 'bearer' })
      .expect(403);
    const body = {
      requestId: randomUUID(),
      reason: 'Packed item and labeled return parcel',
      labelCode: label.labelCode,
      evidenceIds: [proof.id],
    };
    await request(app.getHttpServer())
      .post(path() + '/packing')
      .auth(token(f.owner), { type: 'bearer' })
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post(path() + '/packing')
      .auth(token(f.buyer), { type: 'bearer' })
      .send(body)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/dispute-evidence/${proof.id}/download`)
      .auth(token(f.owner), { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/dispute-evidence/${proof.id}/download`)
      .auth(token(stranger), { type: 'bearer' })
      .expect(403);
    const response = await request(app.getHttpServer())
      .get(path())
      .auth(token(f.owner), { type: 'bearer' })
      .expect(200);
    expect(JSON.stringify(response.body)).toContain(proof.id);
    expect(JSON.stringify(response.body)).not.toMatch(
      /storageKey|eTag|requestFingerprint|fingerprint/,
    );
  });
  it('buyer cannot mark carrier delivery, bypass return conditions, or grant a safety waiver', async () => {
    await request(app.getHttpServer())
      .post(`/api/admin/dispute-returns/${label.id}/DELIVERY`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        reason: 'Pretend delivered',
        evidenceIds: [proof.id],
        mode: 'EVIDENCE',
        labelCode: label.labelCode,
        observedAt: new Date().toISOString(),
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/admin/dispute-final-decisions/${f.final.id}/safety-waiver`)
      .auth(token(f.buyer), { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        mode: 'EVIDENCE',
        basis: 'UNSAFE',
        reason: 'Unsafe',
        instructions: 'Dispose',
        evidenceIds: [proof.id],
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(path() + '/packing')
      .auth(token(f.buyer), { type: 'bearer' })
      .send({
        requestId: randomUUID(),
        reason: 'Unknown flag not accepted',
        evidenceIds: [proof.id],
        ready: true,
      })
      .expect(400);
  });
});
