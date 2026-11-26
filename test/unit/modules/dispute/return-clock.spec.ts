import type { EntityManager } from 'typeorm';

import type { DisputeFinalDecision } from '@/modules/dispute/entities/dispute-final-decision.entity';
import { DisputeIssue } from '@/modules/dispute/entities/dispute-issue.entity';
import { DisputeReturn } from '@/modules/dispute/returns/entities/dispute-return.entity';
import {
  applyVerifiedHandoverClock,
  assertReturnResumable,
  handoverExpired,
  requiresTimelyHandoverReview,
  resumedHandoverDeadline,
} from '@/modules/dispute/returns/policies/return-clock.policy';
import {
  pauseReturnForCarrier,
  replaceReturnLabel,
  returnExecutionGate,
} from '@/modules/dispute/returns/return.lifecycle';

describe('Return authoritative clocks', () => {
  const by = new Date('2026-11-20T00:00:00Z');
  it('accepts physical handover during a valid pause even after the old deadline', () => {
    const at = new Date(+by + 3600000);
    const row = {
      state: 'PAUSED',
      pausedAt: new Date(+by - 1000),
      handoverBy: by,
      remainingMs: 1000,
      labelReplacementRequired: false,
    } as DisputeReturn;
    applyVerifiedHandoverClock(row, at);
    expect(row.state).toBe('IN_TRANSIT');
    expect(+row.handoverBy! - +at).toBe(86400000);
    expect(() => assertReturnResumable(row)).toThrow(
      'Only an unshipped paused return can resume',
    );
  });
  it('does not revive movement on a cancelled label', () => {
    const row = {
      state: 'PAUSED',
      pausedAt: by,
      handoverBy: by,
      remainingMs: 1000,
      labelReplacementRequired: true,
    } as DisputeReturn;
    applyVerifiedHandoverClock(row, by);
    expect(row.state).toBe('PAUSED');
    expect(row.handoverAt).toEqual(by);
    expect(row.timelyHandoverReviewRequired).toBe(true);
    expect(() => assertReturnResumable(row)).toThrow(
      'Only an unshipped paused return can resume',
    );
  });
  it('preserves the original timely deadline for a scan predating the pause', () => {
    const row = {
      state: 'PAUSED',
      pausedAt: new Date(+by + 1000),
      handoverBy: by,
      remainingMs: 1000,
      labelReplacementRequired: false,
    } as DisputeReturn;
    applyVerifiedHandoverClock(row, by);
    expect(row.state).toBe('IN_TRANSIT');
    expect(row.handoverBy).toEqual(by);
    row.state = 'PAUSED';
    expect(() => assertReturnResumable(row)).toThrow(
      'Only an unshipped paused return can resume',
    );
  });
  it('preserves an already verified pause after the former deadline', async () => {
    const manager = { save: async (value: unknown) => value } as EntityManager;
    const row = {
      state: 'PAUSED',
      labelCode: 'old',
      handoverBy: by,
      remainingMs: 7200000,
    } as DisputeReturn;
    await pauseReturnForCarrier(
      manager,
      row,
      new Date(+by + 1),
      'Confirmed cancellation',
    );
    expect(row.remainingMs).toBe(7200000);
    expect(row.state).toBe('PAUSED');
  });
  it('rejects new carrier pauses once an unpaused deadline expired', async () => {
    const manager = { save: async (value: unknown) => value } as EntityManager;
    const row = {
      state: 'AWAITING_HANDOVER',
      labelCode: 'old',
      handoverBy: by,
    } as DisputeReturn;
    await expect(
      pauseReturnForCarrier(
        manager,
        row,
        new Date(+by + 1),
        'Cancellation observed',
      ),
    ).rejects.toThrow('Carrier label cannot be paused in this return phase');
    expect(row.state).toBe('AWAITING_HANDOVER');
  });
  it('replaces only paused unusable labels and preserves remaining time with minimum day', async () => {
    const manager = { save: async (value: unknown) => value } as EntityManager;
    const row = {
      state: 'AWAITING_HANDOVER',
      mode: 'EVIDENCE',
      labelCode: 'old',
      handoverBy: new Date(+by + 1),
      handoverAt: null,
    } as DisputeReturn;
    await pauseReturnForCarrier(
      manager,
      row,
      by,
      'Carrier confirmed cancellation',
    );
    expect(row.remainingMs).toBe(1);
    expect(row.labelReplacementRequired).toBe(true);
    await replaceReturnLabel(
      manager,
      row,
      { mode: 'EVIDENCE', waybillCode: 'new', instructions: 'Prepaid pickup' },
      by,
    );
    expect(row.state).toBe('AWAITING_HANDOVER');
    expect(row.labelReplacementRequired).toBe(false);
    expect(+row.handoverBy! - +by).toBe(86400000);
  });
  it('flags timely carrier proof discovered after expiry for manual review', () => {
    const row = { state: 'EXPIRED', handoverBy: by } as DisputeReturn;
    expect(requiresTimelyHandoverReview(row, by)).toBe(true);
    expect(requiresTimelyHandoverReview(row, new Date(+by + 1))).toBe(false);
  });
  it('keeps the last millisecond available and holds pending evidenced review', () => {
    const row = {
      state: 'AWAITING_HANDOVER',
      handoverBy: by,
      obstaclePending: false,
    } as DisputeReturn;
    expect(handoverExpired(row, by)).toBe(false);
    expect(handoverExpired(row, new Date(+by + 1))).toBe(true);
    row.obstaclePending = true;
    expect(handoverExpired(row, new Date(+by + 1))).toBe(false);
  });
  it('resumes remaining time with a minimum full day', () => {
    expect(+resumedHandoverDeadline(1, by) - +by).toBe(86400000);
    expect(+resumedHandoverDeadline(172800000, by) - +by).toBe(172800000);
  });
  it('cannot execute a ready row whose physical handover was late', async () => {
    const row = {
      remedyKey: 'item',
      orderId: 'order',
      productId: 'product',
      buyerId: 'buyer',
      shopId: 'shop',
      state: 'READY',
      mode: 'EVIDENCE',
      readyAt: by,
      handoverBy: by,
      handoverAt: new Date(+by + 1),
      refundLimit: null,
    } as DisputeReturn;
    const manager = {
      findOneBy: async () => row,
      save: async (value: unknown) => value,
      findOneByOrFail: async (entity: unknown) =>
        entity === DisputeIssue
          ? { caseId: 'case', productId: 'product' }
          : { orderId: 'order', buyerId: 'buyer', shopId: 'shop' },
    } as unknown as EntityManager;
    const final = {
      remedyKey: 'item',
      refundPlan: { amount: 100, condition: 'RETURN_REQUIRED' },
    } as DisputeFinalDecision;
    expect((await returnExecutionGate(manager, final, by)).status).toBe(
      'PENDING',
    );
  });

  it('uses the verified effective obstacle time, not the later administrative verification time', () => {
    const obstacleAt = new Date('2026-11-04T00:00:00Z'),
      handoverAt = new Date('2026-11-06T00:00:00Z');
    const row = {
      state: 'PAUSED',
      obstacleAt,
      pausedAt: new Date('2026-11-07T00:00:00Z'),
      handoverBy: new Date('2026-11-05T00:00:00Z'),
      remainingMs: 86400000,
      labelReplacementRequired: false,
    } as DisputeReturn;
    applyVerifiedHandoverClock(row, handoverAt);
    expect(row.state).toBe('IN_TRANSIT');
    expect(row.handoverAt).toEqual(handoverAt);
    expect(row.handoverBy!.getTime()).toBeGreaterThanOrEqual(
      handoverAt.getTime() + 86400000,
    );
  });
});
