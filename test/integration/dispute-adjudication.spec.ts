import { randomUUID } from 'node:crypto';

import ms from 'ms';

import { DisputeAdjudicationService } from '@/modules/dispute/dispute-adjudication.service';
import { DisputeReviewService } from '@/modules/dispute/dispute-review.service';
import { DisputeService } from '@/modules/dispute/dispute.service';
import { DisputeDecision } from '@/modules/dispute/entities/dispute-decision.entity';
import {
  DisputeAudit,
  DisputeIssue,
  DisputeMessage,
  DisputeNotice,
} from '@/modules/dispute/entities/dispute.entity';
import { Order } from '@/modules/order/entities';
import { OrderFundingService } from '@/modules/order/order-funding.service';
import { OrderSettlementService } from '@/modules/order/order-settlement.service';
import { OrderAccess } from '@/modules/order/order.access';
import { FulfillmentCalendar } from '@/modules/shipment/entities';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShopSettlement } from '@/modules/shop-finance/entities/shop-settlement.entity';
import { WalletCredit } from '@/modules/wallet/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Immutable initial Admin decision (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: DisputeAdjudicationService;
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new DisputeAdjudicationService(database.dataSource);
  });
  afterAll(async () => database?.destroy());
  const input = (reviewToken: string) => ({
    requestId: randomUUID(),
    reviewToken,
    outcome: 'REQUIRE_RETURN' as const,
    responsibility: 'SELLER' as const,
    reason: 'Confirmed mismatch with the listing snapshot',
    evidenceAssessment:
      'Photo shows the received item; packaging and seller response reviewed',
  });
  it('records snapshot, notices and pending appeal without transferring or refunding any money', async () => {
    const f = await adjudicationFixture(database.dataSource);
    const review = await service.review(f.issue.id, 0);
    const decision = await service.decide(
      f.admin.id,
      f.issue.id,
      input(review.reviewToken),
    );
    expect(decision.outcome).toBe('REQUIRE_RETURN');
    expect(decision.itemPrice).toBe(100001);
    expect(decision.remedyKey).toBe(`${f.order.id}:${f.issue.productId}`);
    expect(decision.appealUntil).not.toBeNull();
    expect(
      (
        await database.dataSource
          .getRepository(DisputeIssue)
          .findOneByOrFail({ id: f.issue.id })
      ).status,
    ).toBe('AWAITING_APPEAL');
    expect(
      (
        await database.dataSource
          .getRepository(Order)
          .findOneByOrFail({ id: f.order.id })
      ).status,
    ).toBe('dispute');
    expect(
      await database.dataSource.getRepository(ShopSettlement).count(),
    ).toBe(0);
    expect(await database.dataSource.getRepository(WalletCredit).count()).toBe(
      0,
    );
  });
  it('replays once under concurrency and refuses changed or cross-issue request reuse', async () => {
    const f = await adjudicationFixture(database.dataSource);
    const data = input((await service.review(f.issue.id, 0)).reviewToken);
    const results = await Promise.all([
      service.decide(f.admin.id, f.issue.id, data),
      service.decide(f.admin.id, f.issue.id, data),
    ]);
    expect(results[0].id).toBe(results[1].id);
    await expect(
      service.decide(f.admin.id, f.issue.id, {
        ...data,
        reason: 'Changed reason',
      }),
    ).rejects.toThrow('already');
    const other = await adjudicationFixture(database.dataSource);
    await expect(
      service.decide(f.admin.id, other.issue.id, data),
    ).rejects.toThrow('already');
  });
  it('rejects stale review after a new party reply and succeeds after refreshing', async () => {
    const f = await adjudicationFixture(database.dataSource);
    const data = input((await service.review(f.issue.id, 0)).reviewToken);
    await new DisputeService(database.dataSource, new OrderAccess()).reply(
      f.owner.id,
      f.issue.id,
      {
        requestId: randomUUID(),
        text: 'New packing clarification',
        evidenceIds: [],
      },
    );
    await expect(service.decide(f.admin.id, f.issue.id, data)).rejects.toThrow(
      'Review changed',
    );
    expect(
      await database.dataSource
        .getRepository(DisputeDecision)
        .countBy({ issueId: f.issue.id }),
    ).toBe(0);
    await service.decide(
      f.admin.id,
      f.issue.id,
      input((await service.review(f.issue.id, 0)).reviewToken),
    );
  });
  it('waits the seller response deadline even if the seller already replied', async () => {
    const f = await adjudicationFixture(database.dataSource);
    await database.dataSource
      .getRepository(DisputeIssue)
      .update(f.issue.id, { sellerRespondBy: new Date(Date.now() + ms('1h')) });
    const data = input((await service.review(f.issue.id, 0)).reviewToken);
    await expect(service.decide(f.admin.id, f.issue.id, data)).rejects.toThrow(
      'Seller response',
    );
  });
  it('rejects forced partial/no-return variants and return remedy without seller fault', async () => {
    const f = await adjudicationFixture(database.dataSource);
    const data = input((await service.review(f.issue.id, 0)).reviewToken);
    await expect(
      service.decide(f.admin.id, f.issue.id, {
        ...data,
        responsibility: 'CARRIER',
      }),
    ).rejects.toThrow('Seller fault');
    await expect(
      service.decide(f.admin.id, f.issue.id, {
        ...data,
        refundAmount: 1,
      } as typeof data),
    ).rejects.toThrow('Unrecognized key');
  });
  it('freezes ordinary replies/evidence after decision while retaining the original record', async () => {
    const f = await adjudicationFixture(database.dataSource);
    const decided = await service.decide(
      f.admin.id,
      f.issue.id,
      input((await service.review(f.issue.id, 0)).reviewToken),
    );
    const intake = new DisputeService(database.dataSource, new OrderAccess());
    await expect(
      intake.reply(f.buyer.id, f.issue.id, {
        requestId: randomUUID(),
        text: 'Edit after decision',
        evidenceIds: [],
      }),
    ).rejects.toThrow('not active');
    await expect(
      intake.supplement(f.buyer.id, f.issue.id, {
        evidenceIds: [f.evidence.id],
      }),
    ).rejects.toThrow('decision');
    expect(
      await database.dataSource
        .getRepository(DisputeDecision)
        .countBy({ issueId: f.issue.id }),
    ).toBe(1);
    expect(
      (
        await database.dataSource
          .getRepository(DisputeDecision)
          .findOneByOrFail({ id: decided.id })
      ).reason,
    ).toBe(decided.reason);
  });
  it('keeps a decided issue holding funds when a different incomplete issue expires', async () => {
    const f = await adjudicationFixture(database.dataSource);
    await service.decide(
      f.admin.id,
      f.issue.id,
      input((await service.review(f.issue.id, 0)).reviewToken),
    );
    const pending = await database.dataSource.getRepository(DisputeIssue).save({
      caseId: f.row.id,
      productId: f.issue.productId,
      kind: 'TRANSIT_DAMAGE',
      description: 'Another problem missing photos',
      status: 'NEEDS_EVIDENCE',
      supplementBy: new Date(Date.now() - 1),
    });
    await new DisputeReviewService(database.dataSource).refreshIssue(
      pending.id,
    );
    expect(
      (
        await database.dataSource
          .getRepository(Order)
          .findOneByOrFail({ id: f.order.id })
      ).status,
    ).toBe('dispute');
  });
  it('recovers missing appeal calendar from original notice time and never restarts the review clock', async () => {
    const f = await adjudicationFixture(database.dataSource);
    const review = await service.review(f.issue.id, 0);
    await database.dataSource.getRepository(FulfillmentCalendar).clear();
    const decided = await service.decide(
      f.admin.id,
      f.issue.id,
      input(review.reviewToken),
    );
    expect(decided.calendarMissing).toBe(true);
    expect(decided.appealUntil).toBeNull();
    await database.dataSource.getRepository(FulfillmentCalendar).save({
      year: new Date().getUTCFullYear(),
      closedDates: [],
      source: 'Restored explicit test calendar',
      approvedBy: f.admin.id,
    });
    await new DisputeReviewService(database.dataSource).refreshIssue(
      f.issue.id,
    );
    const recovered = await database.dataSource
      .getRepository(DisputeDecision)
      .findOneByOrFail({ id: decided.id });
    expect(recovered.appealUntil).not.toBeNull();
    expect(recovered.notifiedAt).toEqual(decided.notifiedAt);
  });
  it('rollback keeps issue active if decision audit fails', async () => {
    const f = await adjudicationFixture(database.dataSource);
    const data = input((await service.review(f.issue.id, 0)).reviewToken);
    await database.dataSource.query(
      'ALTER TABLE dispute_audits ADD CONSTRAINT test_reject_decision CHECK (false) NOT VALID',
    );
    try {
      await expect(
        service.decide(f.admin.id, f.issue.id, data),
      ).rejects.toThrow('test_reject_decision');
    } finally {
      await database.dataSource.query(
        'ALTER TABLE dispute_audits DROP CONSTRAINT test_reject_decision',
      );
    }
    expect(
      await database.dataSource
        .getRepository(DisputeDecision)
        .countBy({ issueId: f.issue.id }),
    ).toBe(0);
    expect(
      (
        await database.dataSource
          .getRepository(DisputeIssue)
          .findOneByOrFail({ id: f.issue.id })
      ).status,
    ).toBe('ACTIVE');
    expect(
      await database.dataSource
        .getRepository(DisputeAudit)
        .countBy({ issueId: f.issue.id }),
    ).toBe(0);
  });
  it('can reject an unproven claim without creating automatic buyer fault, refund or release', async () => {
    const f = await adjudicationFixture(database.dataSource);
    const data = input((await service.review(f.issue.id, 0)).reviewToken);
    const decision = await service.decide(f.admin.id, f.issue.id, {
      ...data,
      outcome: 'REJECT_CLAIM',
      responsibility: 'UNDETERMINED',
    });
    expect(decision.outcome).toBe('REJECT_CLAIM');
    expect(decision.responsibility).toBe('UNDETERMINED');
    expect(
      await database.dataSource.getRepository(ShopSettlement).count(),
    ).toBe(0);
    expect(
      await database.dataSource
        .getRepository(DisputeNotice)
        .countBy({ issueId: f.issue.id, action: 'DECIDED' }),
    ).toBe(3);
    expect(
      (
        await database.dataSource
          .getRepository(Order)
          .findOneByOrFail({ id: f.order.id })
      ).status,
    ).toBe('dispute');
  });
  it('fingerprints all replies beyond the first page and preserves one review token across pagination', async () => {
    const f = await adjudicationFixture(database.dataSource);
    await database.dataSource.getRepository(DisputeMessage).save(
      Array.from({ length: 101 }, (_, index) => ({
        issueId: f.issue.id,
        requestId: randomUUID(),
        actorId: f.owner.id,
        party: 'SELLER' as const,
        text: `Evidence clarification ${index}`,
        evidenceIds: [],
        late: true,
        createdAt: new Date(Date.now() - ms('1h') + index),
      })),
    );
    const first = await service.review(f.issue.id, 0),
      second = await service.review(f.issue.id, 100);
    expect(first.messages).toHaveLength(100);
    expect(second.messages).toHaveLength(1);
    expect(first.messageCount).toBe(101);
    expect(first.reviewToken).toBe(second.reviewToken);
    await new DisputeService(database.dataSource, new OrderAccess()).reply(
      f.owner.id,
      f.issue.id,
      {
        requestId: randomUUID(),
        text: 'New reply after all review pages',
        evidenceIds: [],
      },
    );
    await expect(
      service.decide(f.admin.id, f.issue.id, input(first.reviewToken)),
    ).rejects.toThrow('Review changed');
  });
  it('awaiting-appeal issue still blocks settlement after its deadline and a wrong order status change', async () => {
    const f = await adjudicationFixture(database.dataSource);
    const decision = await service.decide(
      f.admin.id,
      f.issue.id,
      input((await service.review(f.issue.id, 0)).reviewToken),
    );
    await database.dataSource
      .getRepository(DisputeDecision)
      .update(decision.id, { appealUntil: new Date(Date.now() - ms('1h')) });
    await new DisputeReviewService(database.dataSource).refreshIssue(
      f.issue.id,
    );
    await database.dataSource
      .getRepository(Order)
      .update(f.order.id, { status: 'completed' });
    await database.dataSource.getRepository(Shipment).save({
      orderId: f.order.id,
      state: 'BOOKED',
      orderCode: randomUUID(),
      payload: {},
      input: {} as Shipment['input'],
      quotedParcel: {} as Shipment['quotedParcel'],
      codAmount: f.order.total,
      providerStatus: 'delivered',
    });
    const funding = new OrderFundingService();
    const spy = jest.spyOn(funding, 'heldCredit');
    await new OrderSettlementService(database.dataSource, funding).settleOrder(
      f.order.id,
    );
    expect(spy).not.toHaveBeenCalled();
  });
  it('same-item problems share a remedy key instead of creating two independently payable refunds', async () => {
    const f = await adjudicationFixture(database.dataSource);
    const first = await service.decide(
      f.admin.id,
      f.issue.id,
      input((await service.review(f.issue.id, 0)).reviewToken),
    );
    const secondIssue = await database.dataSource
      .getRepository(DisputeIssue)
      .save({ ...f.issue, id: randomUUID(), kind: 'NOT_AS_DESCRIBED' });
    const second = await service.decide(
      f.admin.id,
      secondIssue.id,
      input((await service.review(secondIssue.id, 0)).reviewToken),
    );
    expect(first.remedyKey).toBe(second.remedyKey);
    expect(await database.dataSource.getRepository(WalletCredit).count()).toBe(
      0,
    );
  });
  it('records upheld missing-item finding without requiring return of an absent item', async () => {
    const f = await adjudicationFixture(database.dataSource);
    await database.dataSource
      .getRepository(DisputeIssue)
      .update(f.issue.id, { kind: 'MISSING_ITEM' });
    const data = input((await service.review(f.issue.id, 0)).reviewToken);
    await expect(service.decide(f.admin.id, f.issue.id, data)).rejects.toThrow(
      'Missing item',
    );
    const decision = await service.decide(f.admin.id, f.issue.id, {
      ...data,
      outcome: 'UPHOLD_CLAIM',
    });
    expect(decision.outcome).toBe('UPHOLD_CLAIM');
    expect(await database.dataSource.getRepository(WalletCredit).count()).toBe(
      0,
    );
  });
});
