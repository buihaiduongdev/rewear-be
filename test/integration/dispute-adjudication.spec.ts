import ms from 'ms';

import { GhnShipmentClient } from '@/infrastructure/shipping/clients/ghn-shipment.client';
import { StorageService } from '@/infrastructure/storage';
import { DisputeAdjudicationService } from '@/modules/dispute/dispute-adjudication.service';
import { DisputeRefundService } from '@/modules/dispute/dispute-refund.service';
import { DisputeAccess } from '@/modules/dispute/dispute.access';
import { DisputeService } from '@/modules/dispute/dispute.service';
import { DisputeIssue } from '@/modules/dispute/entities/dispute-issue.entity';
import { DisputeReturnService } from '@/modules/dispute/returns/return.service';
import { MediaService } from '@/modules/media/media.service';
import { OrderAccess } from '@/modules/order/order.access';
import { WalletCredit } from '@/modules/wallet/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Admin adjudication and 3-5 business day SLA (PostgreSQL)', () => {
  let database: TestDatabase;
  let adjudication: DisputeAdjudicationService;
  let disputes: DisputeService;

  beforeAll(async () => {
    database = await createTestDatabase();
    const orderAccess = new OrderAccess();
    const access = new DisputeAccess(orderAccess);
    const refunds = new DisputeRefundService(database.dataSource, access);
    const returns = new DisputeReturnService(
      database.dataSource,
      {} as GhnShipmentClient,
      access,
      orderAccess,
      refunds,
    );
    adjudication = new DisputeAdjudicationService(
      database.dataSource,
      access,
      refunds,
      returns,
    );
    disputes = new DisputeService(
      database.dataSource,
      access,
      orderAccess,
      {} as StorageService,
      {} as MediaService,
    );
  });

  afterAll(async () => database?.destroy());

  it('extends 3-day SLA once to the 5-business-day ceiling', async () => {
    const f = await adjudicationFixture(database.dataSource);
    await database.dataSource.getRepository(DisputeIssue).update(f.issue.id, {
      maxReviewDueAt: new Date(Date.now() + ms('2d')),
    });
    const extended = await adjudication.extend(f.admin.id, f.issue.id, {
      reason: 'Cross-checking carrier weight record',
    });
    expect(extended.extendedAt).toBeInstanceOf(Date);
    await expect(
      adjudication.extend(f.admin.id, f.issue.id, {
        reason: 'Second extension attempt',
      }),
    ).rejects.toThrow('already extended');
  });

  it('allows immediate decision once seller replies, otherwise waits seller response deadline', async () => {
    const f = await adjudicationFixture(database.dataSource);
    await database.dataSource.getRepository(DisputeIssue).update(f.issue.id, {
      sellerRespondBy: new Date(Date.now() + ms('12h')),
    });
    await expect(
      adjudication.decide(f.admin.id, f.issue.id, {
        outcome: 'REQUIRE_RETURN',
        responsibility: 'SELLER',
        reason: 'Wrong item sent',
      }),
    ).rejects.toThrow('Seller response window');

    await disputes.reply(f.owner.id, f.issue.id, {
      text: 'Confirmed mix-up at warehouse',
      evidenceIds: [],
    });
    const decision = await adjudication.decide(f.admin.id, f.issue.id, {
      outcome: 'REQUIRE_RETURN',
      responsibility: 'SELLER',
      reason: 'Wrong item confirmed by seller',
    });
    expect(decision.outcome).toBe('REQUIRE_RETURN');
    expect(decision.refundAmount).toBe(100001);
    expect(decision.appealUntil).toBeInstanceOf(Date);
    expect(await database.dataSource.getRepository(WalletCredit).count()).toBe(
      0,
    );
  });

  it('supports partial keep-refund agreement and blocks duplicate initial decisions', async () => {
    const f = await adjudicationFixture(database.dataSource);
    const decision = await adjudication.decide(f.admin.id, f.issue.id, {
      outcome: 'UPHOLD_CLAIM',
      responsibility: 'SELLER',
      reason: 'Minor defect partial keep-refund',
      refundAmount: 40000,
    });
    expect(decision.refundAmount).toBe(40000);
    await expect(
      adjudication.decide(f.admin.id, f.issue.id, {
        outcome: 'REJECT_CLAIM',
        responsibility: 'UNDETERMINED',
        reason: 'Duplicate attempt',
      }),
    ).rejects.toThrow('already recorded');
    await expect(
      disputes.reply(f.buyer.id, f.issue.id, {
        text: 'Reply after decision',
        evidenceIds: [],
      }),
    ).rejects.toThrow('not active');
  });
});
