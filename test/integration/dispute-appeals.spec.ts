import { randomUUID } from 'node:crypto';

import ms from 'ms';

import { GhnShipmentClient } from '@/infrastructure/shipping/clients/ghn-shipment.client';
import { AuthProvider } from '@/modules/auth/enums';
import { DisputeAdjudicationService } from '@/modules/dispute/dispute-adjudication.service';
import { DisputeRefundService } from '@/modules/dispute/dispute-refund.service';
import { DisputeAccess } from '@/modules/dispute/dispute.access';
import { DisputeAppeal } from '@/modules/dispute/entities/dispute-appeal.entity';
import { DisputeCase } from '@/modules/dispute/entities/dispute-case.entity';
import { DisputeDecision } from '@/modules/dispute/entities/dispute-decision.entity';
import { DisputeReturnService } from '@/modules/dispute/returns/return.service';
import { OutboxService } from '@/modules/event/outbox.service';
import { Order } from '@/modules/order/entities';
import { OrderAccess } from '@/modules/order/order.access';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('1-time 2-business-day appeal and finalization (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: DisputeAdjudicationService;

  beforeAll(async () => {
    database = await createTestDatabase();
    const orderAccess = new OrderAccess();
    const access = new DisputeAccess(orderAccess);
    const outbox = new OutboxService();
    const refunds = new DisputeRefundService(
      database.dataSource,
      access,
      outbox,
    );
    const returns = new DisputeReturnService(
      database.dataSource,
      {} as GhnShipmentClient,
      access,
      orderAccess,
      refunds,
    );
    service = new DisputeAdjudicationService(
      database.dataSource,
      access,
      refunds,
      returns,
      outbox,
    );
  });

  afterAll(async () => database?.destroy());

  async function otherAdmin() {
    return database.dataSource.getRepository(User).save({
      email: `${randomUUID()}@test.local`,
      fullName: 'Independent reviewer',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      provider: AuthProvider.CREDENTIALS,
    });
  }

  it('allows at most 1 appeal per party within 2 business days and requires independent Admin conclusion', async () => {
    const f = await adjudicationFixture(database.dataSource);
    const reviewer = await otherAdmin();
    const decision = await service.decide(f.admin.id, f.issue.id, {
      outcome: 'REQUIRE_RETURN',
      responsibility: 'SELLER',
      reason: 'Initial finding',
    });

    await service.submitAppeal(f.buyer.id, decision.id, {
      reason: 'Item matches listing defect exception',
      evidenceIds: [],
    });
    await expect(
      service.submitAppeal(f.buyer.id, decision.id, {
        reason: 'Second buyer appeal attempt',
        evidenceIds: [],
      }),
    ).rejects.toThrow('already filed');

    await service.submitAppeal(f.owner.id, decision.id, {
      reason: 'Seller counter-appeal',
      evidenceIds: [],
    });
    expect(
      await database.dataSource
        .getRepository(DisputeAppeal)
        .countBy({ decisionId: decision.id }),
    ).toBe(2);

    await expect(
      service.concludeAppeal(f.admin.id, decision.id, {
        outcome: 'REJECT_CLAIM',
        responsibility: 'UNDETERMINED',
        reason: 'Self-review attempt',
      }),
    ).rejects.toThrow('another active Admin');

    const concluded = await service.concludeAppeal(reviewer.id, decision.id, {
      outcome: 'REJECT_CLAIM',
      responsibility: 'UNDETERMINED',
      reason: 'Combined final review rejects claim',
    });
    expect(concluded.finalOutcome).toBe('REJECT_CLAIM');
    expect(concluded.finalActorId).toBe(reviewer.id);

    // Concluded appeals are never retroactively marked reviewOverdue
    await database.dataSource
      .getRepository(DisputeAppeal)
      .update(
        { decisionId: decision.id },
        { reviewDueAt: new Date(Date.now() - ms('2h')) },
      );
    await service.run();
    expect(
      await database.dataSource.getRepository(DisputeAppeal).countBy({
        decisionId: decision.id,
        reviewOverdue: true,
      }),
    ).toBe(0);

    expect(
      (
        await database.dataSource
          .getRepository(DisputeCase)
          .findOneByOrFail({ id: f.row.id })
      ).state,
    ).toBe('CLOSED');
    expect(
      (
        await database.dataSource
          .getRepository(Order)
          .findOneByOrFail({ id: f.order.id })
      ).status,
    ).toBe('completed');
  });

  it('auto-finalizes unappealed decisions only after the 2-business-day appeal window closes', async () => {
    const f = await adjudicationFixture(database.dataSource);
    const decision = await service.decide(f.admin.id, f.issue.id, {
      outcome: 'REJECT_CLAIM',
      responsibility: 'UNDETERMINED',
      reason: 'Insufficient claim',
    });
    await service.refreshIssue(f.issue.id);
    expect(
      (
        await database.dataSource
          .getRepository(DisputeDecision)
          .findOneByOrFail({ id: decision.id })
      ).finalizedAt,
    ).toBeNull();

    await database.dataSource
      .getRepository(DisputeDecision)
      .update(decision.id, { appealUntil: new Date(Date.now() - ms('1h')) });
    await expect(
      service.submitAppeal(f.buyer.id, decision.id, {
        reason: 'Late appeal',
        evidenceIds: [],
      }),
    ).rejects.toThrow('Appeal window closed');

    await service.refreshIssue(f.issue.id);
    const finalized = await database.dataSource
      .getRepository(DisputeDecision)
      .findOneByOrFail({ id: decision.id });
    expect(finalized.finalOutcome).toBe('REJECT_CLAIM');
    expect(finalized.finalActorId).toBeNull();
  });
});
