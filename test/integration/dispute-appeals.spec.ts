import { randomUUID } from 'node:crypto';

import ms from 'ms';
import { In, Not } from 'typeorm';

import { AuthProvider } from '@/modules/auth/enums';
import { DisputeAdjudicationService } from '@/modules/dispute/dispute-adjudication.service';
import { DisputeAppealService } from '@/modules/dispute/dispute-appeal.service';
import { DisputeReviewService } from '@/modules/dispute/dispute-review.service';
import { DisputeAccess } from '@/modules/dispute/dispute.access';
import {
  DisputeAppeal,
  DisputeAppealReview,
  DisputeFinalDecision,
} from '@/modules/dispute/entities/dispute-appeal.entity';
import { DisputeDecision } from '@/modules/dispute/entities/dispute-decision.entity';
import {
  DisputeCase,
  DisputeEvidence,
  DisputeIssue,
} from '@/modules/dispute/entities/dispute.entity';
import type { DisputeAppealInput } from '@/modules/dispute/types/dispute-appeal.type';
import { Order } from '@/modules/order/entities/order.entity';
import { OrderAccess } from '@/modules/order/order.access';
import { FulfillmentCalendar } from '@/modules/shipment/entities/late-handover.entity';
import { ShopSettlement } from '@/modules/shop-finance/entities/shop-settlement.entity';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';
import { WalletCredit } from '@/modules/wallet/entities/wallet.entity';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';
import { createPrivateMedia } from '../support/private-media';

describe('Two-party dispute appeal and final conclusion (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: DisputeAppealService;
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new DisputeAppealService(
      database.dataSource,
      new DisputeAccess(new OrderAccess()),
    );
  });
  afterAll(async () => database?.destroy());
  async function fixture(
    outcome: 'REQUIRE_RETURN' | 'REJECT_CLAIM' = 'REQUIRE_RETURN',
  ) {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const initial = new DisputeAdjudicationService(db);
    const decision = await initial.decide(f.admin.id, f.issue.id, {
      requestId: randomUUID(),
      reviewToken: (await initial.review(f.issue.id)).reviewToken,
      outcome,
      responsibility: 'SELLER',
      reason: 'Initial finding',
      evidenceAssessment: 'Initial evidence was assessed',
    });
    return { ...f, db, decision };
  }
  const request = () => ({
    requestId: randomUUID(),
    reason: 'Please review the identified mistake',
    specificError: 'The conclusion used the wrong item reference',
    evidenceIds: [] as string[],
  });
  async function otherAdmin() {
    return database.dataSource.getRepository(User).save({
      email: `${randomUUID()}@test.local`,
      fullName: 'Independent reviewer',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      provider: AuthProvider.CREDENTIALS,
    });
  }
  async function closeWindow(f: Awaited<ReturnType<typeof fixture>>) {
    await f.db
      .getRepository(DisputeDecision)
      .update(f.decision.id, { appealUntil: new Date(Date.now() - ms('1h')) });
    await new DisputeReviewService(f.db).refreshIssue(f.issue.id);
  }
  function conclusion(reviewToken: string) {
    return {
      requestId: randomUUID(),
      reviewToken,
      outcome: 'REJECT_CLAIM' as const,
      responsibility: 'UNDETERMINED' as const,
      reason: 'Final combined assessment',
      evidenceAssessment: 'Both requests and evidence assessed',
      sameAdminReason: null,
    };
  }
  it('each party may file once; duplicate replay and concurrency retain one immutable request', async () => {
    const f = await fixture();
    const data = request();
    const requests = await Promise.all([
      service.submit(f.buyer.id, f.decision.id, data),
      service.submit(f.buyer.id, f.decision.id, data),
    ]);
    expect(requests[0].id).toBe(requests[1].id);
    await service.submit(f.owner.id, f.decision.id, request());
    expect(
      await f.db
        .getRepository(DisputeAppeal)
        .countBy({ decisionId: f.decision.id }),
    ).toBe(2);
    await expect(
      service.submit(f.buyer.id, f.decision.id, request()),
    ).rejects.toThrow('already');
    await expect(
      service.submit(f.buyer.id, f.decision.id, {
        ...data,
        reason: 'Altered replay',
      }),
    ).rejects.toThrow('already');
  });
  it('requires new evidence or a specific error and rejects unrelated/cross-order evidence', async () => {
    const f = await fixture();
    await expect(
      service.submit(f.buyer.id, f.decision.id, {
        ...request(),
        specificError: undefined,
      } as unknown as DisputeAppealInput),
    ).rejects.toThrow('requires');
    await expect(
      service.submit(f.buyer.id, f.decision.id, {
        ...request(),
        specificError: undefined,
        evidenceIds: [f.evidence.id],
      } as unknown as DisputeAppealInput),
    ).rejects.toThrow('new evidence');
    await expect(
      service.submit(randomUUID(), f.decision.id, request()),
    ).rejects.toThrow('access');
  });
  it('rejects new submissions after the original window; accepted replays remain safe', async () => {
    const f = await fixture();
    const data = request();
    const original = await service.submit(f.buyer.id, f.decision.id, data);
    await closeWindow(f);
    expect((await service.submit(f.buyer.id, f.decision.id, data)).id).toBe(
      original.id,
    );
    await expect(
      service.submit(f.owner.id, f.decision.id, request()),
    ).rejects.toThrow('window');
  });
  it('cannot conclude before the common submission window ends even if both parties file early', async () => {
    const f = await fixture();
    const admin = await otherAdmin();
    await service.submit(f.buyer.id, f.decision.id, request());
    await service.submit(f.owner.id, f.decision.id, request());
    const review = await service.review(f.decision.id);
    await expect(
      service.conclude(admin.id, f.decision.id, conclusion(review.reviewToken)),
    ).rejects.toThrow('window');
  });
  it('independent Admin concludes both parties together, preserving initial decision and no money movements', async () => {
    const f = await fixture();
    const admin = await otherAdmin();
    await service.submit(f.buyer.id, f.decision.id, request());
    await service.submit(f.owner.id, f.decision.id, request());
    await closeWindow(f);
    const review = await service.review(f.decision.id);
    expect(review.appeals).toHaveLength(2);
    const final = await service.conclude(
      admin.id,
      f.decision.id,
      conclusion(review.reviewToken),
    );
    expect(final.outcome).toBe('REJECT_CLAIM');
    expect(final.source).toBe('APPEAL_REVIEW');
    expect(
      (
        await f.db
          .getRepository(DisputeDecision)
          .findOneByOrFail({ id: f.decision.id })
      ).outcome,
    ).toBe('REQUIRE_RETURN');
    expect(await f.db.getRepository(WalletCredit).count()).toBe(0);
    expect(await f.db.getRepository(ShopSettlement).count()).toBe(0);
    await expect(
      service.submit(f.buyer.id, f.decision.id, request()),
    ).rejects.toThrow('final');
  });
  it('original Admin cannot self-review when another active Admin exists', async () => {
    const f = await fixture();
    await otherAdmin();
    await service.submit(f.buyer.id, f.decision.id, request());
    await closeWindow(f);
    await expect(
      service.conclude(f.admin.id, f.decision.id, {
        ...conclusion((await service.review(f.decision.id)).reviewToken),
        sameAdminReason: 'Busy colleagues',
      }),
    ).rejects.toThrow('another active Admin');
  });
  it('original Admin fallback requires an explicit reason when no other Admin exists', async () => {
    const f = await fixture();
    await service.submit(f.buyer.id, f.decision.id, request());
    await closeWindow(f);
    const admins = await f.db.getRepository(User).findBy({
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      id: Not(f.admin.id),
    });
    await f.db
      .getRepository(User)
      .update(
        { id: In(admins.map((user) => user.id)) },
        { status: UserStatus.INACTIVE },
      );
    try {
      const data = conclusion(
        (await service.review(f.decision.id)).reviewToken,
      );
      await expect(
        service.conclude(f.admin.id, f.decision.id, data),
      ).rejects.toThrow('exception reason');
      const final = await service.conclude(f.admin.id, f.decision.id, {
        ...data,
        sameAdminReason: 'Only active Admin available in this deployment',
      });
      expect(final.sameAdminReason).toContain('Only active Admin');
    } finally {
      if (admins.length)
        await f.db
          .getRepository(User)
          .update(
            { id: In(admins.map((user) => user.id)) },
            { status: UserStatus.ACTIVE },
          );
    }
  });
  it('no accepted appeal makes the original decision final only after the window', async () => {
    const f = await fixture('REJECT_CLAIM');
    await new DisputeReviewService(f.db).refreshIssue(f.issue.id);
    expect(
      await f.db
        .getRepository(DisputeFinalDecision)
        .countBy({ decisionId: f.decision.id }),
    ).toBe(0);
    await closeWindow(f);
    const final = await f.db
      .getRepository(DisputeFinalDecision)
      .findOneByOrFail({ decisionId: f.decision.id });
    expect(final.source).toBe('ORIGINAL_UNAPPEALED');
    expect(
      (await f.db.getRepository(DisputeCase).findOneByOrFail({ id: f.row.id }))
        .state,
    ).toBe('CLOSED');
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('completed');
  });
  it('upheld/return final conclusions stay held for execution and never auto-refund', async () => {
    const f = await fixture();
    await closeWindow(f);
    expect(
      (
        await f.db
          .getRepository(DisputeIssue)
          .findOneByOrFail({ id: f.issue.id })
      ).status,
    ).toBe('AWAITING_EXECUTION');
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('dispute');
    expect(await f.db.getRepository(WalletCredit).count()).toBe(0);
  });
  it('new owned evidence is accepted but cross-order files are never attached', async () => {
    const f = await fixture(),
      other = await fixture();
    await expect(
      service.submit(f.buyer.id, f.decision.id, {
        ...request(),
        evidenceIds: [other.evidence.id],
      }),
    ).rejects.toThrow('uploader and order');
    const media = await createPrivateMedia(f.db, f.buyer.id);
    const file = await f.db.getRepository(DisputeEvidence).save({
      orderId: f.order.id,
      uploadedById: f.buyer.id,
      mediaId: media.id,
      media,
      tags: ['ISSUE'],
    });
    const appeal = await service.submit(f.buyer.id, f.decision.id, {
      ...request(),
      specificError: null,
      evidenceIds: [file.id],
    });
    expect(appeal.eligibility).toBe('ACCEPTED');
    expect((await service.review(f.decision.id)).evidence).toHaveLength(2);
  });
  it('late appeal review escalates without an ordinary extension or automatic winner', async () => {
    const f = await fixture();
    await service.submit(f.buyer.id, f.decision.id, request());
    await f.db
      .getRepository(DisputeDecision)
      .update(f.decision.id, { appealUntil: new Date(Date.now() - ms('7d')) });
    await f.db.getRepository(DisputeAppealReview).update(
      { decisionId: f.decision.id },
      {
        reviewStartAt: new Date(Date.now() - ms('7d')),
        reviewDueAt: new Date(Date.now() - ms('2d')),
        escalationDueAt: new Date(Date.now() - ms('1d')),
      },
    );
    await new DisputeReviewService(f.db).refreshIssue(f.issue.id);
    const review = await f.db
      .getRepository(DisputeAppealReview)
      .findOneByOrFail({ decisionId: f.decision.id });
    expect(review.reviewOverdue).toBe(true);
    expect(review.escalatedAt).not.toBeNull();
    expect(
      await f.db
        .getRepository(DisputeFinalDecision)
        .countBy({ decisionId: f.decision.id }),
    ).toBe(0);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('dispute');
  });
  it('final decision audit failure rolls back finalization and preserves the live hold', async () => {
    const f = await fixture(),
      admin = await otherAdmin();
    await service.submit(f.buyer.id, f.decision.id, request());
    await closeWindow(f);
    const data = conclusion((await service.review(f.decision.id)).reviewToken);
    await f.db.query(
      'ALTER TABLE dispute_audits ADD CONSTRAINT test_reject_appeal_final CHECK (false) NOT VALID',
    );
    try {
      await expect(
        service.conclude(admin.id, f.decision.id, data),
      ).rejects.toThrow('test_reject_appeal_final');
    } finally {
      await f.db.query(
        'ALTER TABLE dispute_audits DROP CONSTRAINT test_reject_appeal_final',
      );
    }
    expect(
      await f.db
        .getRepository(DisputeFinalDecision)
        .countBy({ decisionId: f.decision.id }),
    ).toBe(0);
    expect(
      (
        await f.db
          .getRepository(DisputeIssue)
          .findOneByOrFail({ id: f.issue.id })
      ).status,
    ).toBe('APPEAL_REVIEW');
  });
  it('rejecting one issue does not close another active issue on the same order', async () => {
    const f = await fixture(),
      admin = await otherAdmin();
    await f.db.getRepository(DisputeIssue).save({
      ...f.issue,
      id: randomUUID(),
      kind: 'NOT_AS_DESCRIBED',
      status: 'ACTIVE',
    });
    await service.submit(f.buyer.id, f.decision.id, request());
    await closeWindow(f);
    await service.conclude(
      admin.id,
      f.decision.id,
      conclusion((await service.review(f.decision.id)).reviewToken),
    );
    expect(
      (await f.db.getRepository(DisputeCase).findOneByOrFail({ id: f.row.id }))
        .state,
    ).toBe('OPEN');
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('dispute');
  });
  it('calendar gaps retain request time and recover eligibility and SLA from original deadlines', async () => {
    const f = await fixture();
    await f.db
      .getRepository(DisputeDecision)
      .update(f.decision.id, { appealUntil: null, calendarMissing: true });
    await f.db.getRepository(FulfillmentCalendar).clear();
    const appeal = await service.submit(f.buyer.id, f.decision.id, request());
    expect(appeal.eligibility).toBe('PENDING_CALENDAR');
    const year = new Date().getUTCFullYear();
    await f.db.getRepository(FulfillmentCalendar).save(
      [year, year + 1].map((year) => ({
        year,
        closedDates: [],
        source: 'Recovered explicit calendar',
        approvedBy: f.admin.id,
      })),
    );
    await new DisputeReviewService(f.db).refreshIssue(f.issue.id);
    const recovered = await f.db
      .getRepository(DisputeAppeal)
      .findOneByOrFail({ id: appeal.id });
    expect(recovered.eligibility).toBe('ACCEPTED');
    expect(recovered.filedAt).toEqual(appeal.filedAt);
  });
});
