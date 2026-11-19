import { randomUUID } from 'node:crypto';

import {
  DisputeRefund,
  DisputeRefundCredit,
} from '@/modules/dispute/entities/dispute-refund.entity';
import { DisputeCase } from '@/modules/dispute/entities/dispute.entity';
import { DisputeReturn } from '@/modules/dispute/returns/entities/dispute-return.entity';
import { DisputeReturnService } from '@/modules/dispute/returns/return.service';
import { FulfillmentCalendar } from '@/modules/shipment/entities/late-handover.entity';
import { WalletAccount } from '@/modules/wallet/entities/wallet.entity';

import { createTestDatabase, type TestDatabase } from '../support/database';
import {
  disputeReturnFixture,
  evidenceForReturn,
  labelForReturn,
} from '../support/dispute-return-fixture';

describe('Post-adjudication return clocks and inspection (PostgreSQL)', () => {
  let database: TestDatabase, service: DisputeReturnService;
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new DisputeReturnService(database.dataSource);
  });
  afterAll(async () => database?.destroy());
  const command = (extra: Record<string, unknown> = {}) => ({
    requestId: randomUUID(),
    reason: 'Verified return workflow action',
    evidenceIds: [] as string[],
    ...extra,
  });
  async function deliver(f: Awaited<ReturnType<typeof disputeReturnFixture>>) {
    const label = await labelForReturn(f);
    const file = await evidenceForReturn(f);
    await service.act(
      f.buyer.id,
      label.id,
      'PACKING',
      command({ labelCode: label.labelCode, evidenceIds: [file.id] }),
    );
    await service.act(
      f.admin.id,
      label.id,
      'HANDOVER',
      command({
        labelCode: label.labelCode,
        mode: 'EVIDENCE',
        observedAt: new Date(),
        evidenceIds: [file.id],
      }),
    );
    await service.act(
      f.admin.id,
      label.id,
      'DELIVERY',
      command({
        labelCode: label.labelCode,
        mode: 'EVIDENCE',
        observedAt: new Date(),
        evidenceIds: [file.id],
      }),
    );
    return { label, file };
  }
  it('does not start the five-day handover clock before a valid final label and instructions', async () => {
    const f = await disputeReturnFixture(database.dataSource);
    expect(f.returned.handoverBy).toBeNull();
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'PENDING',
      blockedReason: 'CONDITIONS_PENDING',
    });
    const label = await labelForReturn(f);
    expect(label.handoverBy!.getTime() - label.labelNotifiedAt!.getTime()).toBe(
      5 * 86400000,
    );
  });
  it('accepts an inspected return and refunds once; packing proof is private and linked', async () => {
    const f = await disputeReturnFixture(database.dataSource);
    await deliver(f);
    await expect(
      service.act(f.buyer.id, f.returned.id, 'ACCEPT_INSPECTION', command()),
    ).rejects.toThrow('Shop order management access required');
    await service.act(
      f.owner.id,
      f.returned.id,
      'ACCEPT_INSPECTION',
      command(),
    );
    await Promise.all([
      f.refunds.refresh(f.final.id),
      f.refunds.refresh(f.final.id),
    ]);
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(1);
    expect(
      await f.db
        .getRepository(WalletAccount)
        .findOneByOrFail({ userId: f.buyer.id }),
    ).toMatchObject({ balance: 100001 });
  });
  it('releases after verified delivery and two-business-day inspection expiry without requiring seller response', async () => {
    const f = await disputeReturnFixture(database.dataSource);
    await deliver(f);
    await f.db
      .getRepository(DisputeReturn)
      .update(f.returned.id, { inspectionDueAt: new Date(Date.now() - 1000) });
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'SUCCEEDED',
    });
  });
  it('calendar gaps do not invent inspection expiry or release money', async () => {
    const f = await disputeReturnFixture(database.dataSource);
    await deliver(f);
    await f.db.getRepository(FulfillmentCalendar).clear();
    await f.db
      .getRepository(DisputeReturn)
      .update(f.returned.id, { inspectionDueAt: null, calendarMissing: true });
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'PENDING',
    });
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(0);
  });
  it('closes only the unexecuted refund after handover expiry, without reporting a wallet credit', async () => {
    const f = await disputeReturnFixture(database.dataSource);
    await labelForReturn(f);
    await f.db
      .getRepository(DisputeReturn)
      .update(f.returned.id, { handoverBy: new Date(Date.now() - 1000) });
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'CLOSED_NO_REFUND',
      executionAmount: 0,
    });
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(0);
    expect(
      (await f.db.getRepository(DisputeCase).findOneByOrFail({ id: f.row.id }))
        .state,
    ).toBe('CLOSED');
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'CLOSED_NO_REFUND',
    });
  });
  it('verified obstacles pause the original remaining time and resume with at least 24 hours', async () => {
    const f = await disputeReturnFixture(database.dataSource),
      label = await labelForReturn(f),
      file = await evidenceForReturn(f);
    await service.act(
      f.buyer.id,
      label.id,
      'OBSTACLE',
      command({ evidenceIds: [file.id] }),
    );
    await service.act(
      f.admin.id,
      label.id,
      'VERIFY_OBSTACLE',
      command({
        mode: 'EVIDENCE',
        observedAt: new Date(),
        evidenceIds: [file.id],
      }),
    );
    const paused = await f.db
      .getRepository(DisputeReturn)
      .findOneByOrFail({ id: label.id });
    expect(paused.state).toBe('PAUSED');
    expect(typeof paused.remainingMs).toBe('number');
    await f.db
      .getRepository(DisputeReturn)
      .update(label.id, { remainingMs: 1000 });
    const before = Date.now();
    await service.act(
      f.admin.id,
      label.id,
      'RESUME',
      command({ mode: 'EVIDENCE' }),
    );
    expect(
      (
        await f.db
          .getRepository(DisputeReturn)
          .findOneByOrFail({ id: label.id })
      ).handoverBy!.getTime(),
    ).toBeGreaterThanOrEqual(before + 86400000);
  });
  it('a timely evidenced objection is reviewed per item; stale decisions conflict and buyer fault adjusts only that item', async () => {
    const f = await disputeReturnFixture(database.dataSource),
      { label } = await deliver(f);
    const proof = await evidenceForReturn(f, f.owner.id, [
      'RETURN_PARCEL',
      'RETURN_LABEL',
      'RETURN_RECEIVED_ITEMS',
    ]);
    await service.act(
      f.owner.id,
      label.id,
      'OBJECTION',
      command({ labelCode: label.labelCode, evidenceIds: [proof.id] }),
    );
    await expect(
      service.act(
        f.admin.id,
        label.id,
        'RESOLVE',
        command({
          reviewToken: '0'.repeat(64),
          conclusion: 'BUYER_FAULT',
          refundLimit: 50000,
          evidenceIds: [proof.id],
        }),
      ),
    ).rejects.toThrow('stale');
    const review = (await service.read(f.admin.id, label.id, true)) as {
      reviewToken: string;
    };
    await service.act(
      f.admin.id,
      label.id,
      'RESOLVE',
      command({
        reviewToken: review.reviewToken,
        conclusion: 'BUYER_FAULT',
        refundLimit: 50000,
        evidenceIds: [proof.id],
      }),
    );
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'SUCCEEDED',
      executionAmount: 50000,
    });
    expect(
      await f.db
        .getRepository(WalletAccount)
        .findOneByOrFail({ userId: f.buyer.id }),
    ).toMatchObject({ balance: 50000 });
    expect(
      (
        await f.db
          .getRepository(DisputeRefund)
          .findOneByOrFail({ finalDecisionId: f.final.id })
      ).executionAmount,
    ).toBe(50000);
  });

  it('verified timely physical handover recorded late needs explicit fresh-token recovery, never automatic monetary reopening', async () => {
    const f = await disputeReturnFixture(database.dataSource),
      label = await labelForReturn(f),
      proof = await evidenceForReturn(f);
    const deadline = new Date(Date.now() - 5000),
      actualHandover = new Date(Date.now() - 10000);
    await f.db
      .getRepository(DisputeReturn)
      .update(label.id, { handoverBy: deadline });
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'CLOSED_NO_REFUND',
    });
    await service.act(
      f.admin.id,
      label.id,
      'HANDOVER',
      command({
        mode: 'EVIDENCE',
        labelCode: label.labelCode,
        observedAt: actualHandover,
        evidenceIds: [proof.id],
      }),
    );
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'CLOSED_NO_REFUND',
    });
    const review = (await service.read(f.admin.id, label.id, true)) as {
      reviewToken: string;
    };
    await service.act(
      f.admin.id,
      label.id,
      'RECOVER_HANDOVER',
      command({
        mode: 'EVIDENCE',
        labelCode: label.labelCode,
        reviewToken: review.reviewToken,
      }),
    );
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'PENDING',
    });
    await service.act(
      f.admin.id,
      label.id,
      'DELIVERY',
      command({
        mode: 'EVIDENCE',
        labelCode: label.labelCode,
        observedAt: new Date(),
        evidenceIds: [proof.id],
      }),
    );
    await service.act(f.owner.id, label.id, 'ACCEPT_INSPECTION', command());
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'SUCCEEDED',
    });
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(1);
  });
  it('a zero item entitlement after verified buyer fault closes without falsely announcing a zero-value wallet refund', async () => {
    const f = await disputeReturnFixture(database.dataSource),
      { label } = await deliver(f);
    const proof = await evidenceForReturn(f, f.owner.id, [
      'RETURN_PARCEL',
      'RETURN_LABEL',
      'RETURN_RECEIVED_ITEMS',
    ]);
    await service.act(
      f.owner.id,
      label.id,
      'OBJECTION',
      command({ labelCode: label.labelCode, evidenceIds: [proof.id] }),
    );
    const review = (await service.read(f.admin.id, label.id, true)) as {
      reviewToken: string;
    };
    await service.act(
      f.admin.id,
      label.id,
      'RESOLVE',
      command({
        reviewToken: review.reviewToken,
        conclusion: 'BUYER_FAULT',
        refundLimit: 0,
        evidenceIds: [proof.id],
      }),
    );
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'CLOSED_NO_REFUND',
      executionAmount: 0,
    });
    expect(
      await f.db
        .getRepository(DisputeRefundCredit)
        .countBy({ orderId: f.order.id }),
    ).toBe(0);
  });

  it('physical handover during a verified pause resumes the frozen duty clock and can proceed to inspection', async () => {
    const f = await disputeReturnFixture(database.dataSource),
      label = await labelForReturn(f),
      proof = await evidenceForReturn(f);
    await service.act(
      f.buyer.id,
      label.id,
      'OBSTACLE',
      command({ evidenceIds: [proof.id] }),
    );
    await service.act(
      f.admin.id,
      label.id,
      'VERIFY_OBSTACLE',
      command({
        mode: 'EVIDENCE',
        observedAt: new Date(),
        evidenceIds: [proof.id],
      }),
    );
    await f.db.getRepository(DisputeReturn).update(label.id, {
      handoverBy: new Date(Date.now() - 1000),
      remainingMs: 5000,
    });
    await service.act(
      f.admin.id,
      label.id,
      'HANDOVER',
      command({
        mode: 'EVIDENCE',
        labelCode: label.labelCode,
        observedAt: new Date(),
        evidenceIds: [proof.id],
      }),
    );
    expect(
      await f.db.getRepository(DisputeReturn).findOneByOrFail({ id: label.id }),
    ).toMatchObject({ state: 'IN_TRANSIT' });
    await expect(
      service.act(
        f.admin.id,
        label.id,
        'RESUME',
        command({ mode: 'EVIDENCE' }),
      ),
    ).rejects.toThrow('paused');
    await service.act(
      f.admin.id,
      label.id,
      'DELIVERY',
      command({
        mode: 'EVIDENCE',
        labelCode: label.labelCode,
        observedAt: new Date(),
        evidenceIds: [proof.id],
      }),
    );
    await service.act(f.owner.id, label.id, 'ACCEPT_INSPECTION', command());
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'SUCCEEDED',
    });
  });
  it('conflicting cancelled-label movement requires explicit Admin review before a real parcel can proceed', async () => {
    const f = await disputeReturnFixture(database.dataSource),
      label = await labelForReturn(f),
      proof = await evidenceForReturn(f);
    await f.db.getRepository(DisputeReturn).update(label.id, {
      state: 'PAUSED',
      pausedAt: new Date(),
      remainingMs: 5000,
      labelReplacementRequired: true,
    });
    await service.act(
      f.admin.id,
      label.id,
      'HANDOVER',
      command({
        mode: 'EVIDENCE',
        labelCode: label.labelCode,
        observedAt: new Date(),
        evidenceIds: [proof.id],
      }),
    );
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'PENDING',
    });
    const review = (await service.read(f.admin.id, label.id, true)) as {
      reviewToken: string;
    };
    await service.act(
      f.admin.id,
      label.id,
      'RECOVER_HANDOVER',
      command({
        mode: 'EVIDENCE',
        labelCode: label.labelCode,
        reviewToken: review.reviewToken,
      }),
    );
    await service.act(
      f.admin.id,
      label.id,
      'DELIVERY',
      command({
        mode: 'EVIDENCE',
        labelCode: label.labelCode,
        observedAt: new Date(),
        evidenceIds: [proof.id],
      }),
    );
    await service.act(f.owner.id, label.id, 'ACCEPT_INSPECTION', command());
    expect(await f.refunds.refresh(f.final.id)).toMatchObject({
      status: 'SUCCEEDED',
    });
  });

  it('can review historical timely pickup before a later cancelled-label pause without losing the real parcel', async () => {
    const f = await disputeReturnFixture(database.dataSource),
      label = await labelForReturn(f),
      proof = await evidenceForReturn(f);
    const at = new Date(Date.now() - 30000);
    await f.db.getRepository(DisputeReturn).update(label.id, {
      state: 'PAUSED',
      pausedAt: new Date(),
      obstacleAt: new Date(),
      remainingMs: 86400000,
      labelReplacementRequired: true,
    });
    await service.act(
      f.admin.id,
      label.id,
      'HANDOVER',
      command({
        mode: 'EVIDENCE',
        labelCode: label.labelCode,
        observedAt: at,
        evidenceIds: [proof.id],
      }),
    );
    const review = (await service.read(f.admin.id, label.id, true)) as {
      reviewToken: string;
    };
    await service.act(
      f.admin.id,
      label.id,
      'RECOVER_HANDOVER',
      command({
        mode: 'EVIDENCE',
        labelCode: label.labelCode,
        reviewToken: review.reviewToken,
      }),
    );
    expect(
      await f.db.getRepository(DisputeReturn).findOneByOrFail({ id: label.id }),
    ).toMatchObject({
      state: 'IN_TRANSIT',
      timelyHandoverReviewRequired: false,
    });
  });
});
