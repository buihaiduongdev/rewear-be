import { ConflictException } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { fulfillmentDeadline } from '@/modules/shipment/utils/fulfillment-calendar';

import { DISPUTE_ACTION } from '../constants/dispute.constant';
import { notifyDispute } from '../dispute.lifecycle';
import { DisputeCase } from '../entities/dispute-case.entity';
import { DisputeFinalDecision } from '../entities/dispute-final-decision.entity';
import { DisputeIssue } from '../entities/dispute-issue.entity';
import {
  RETURN_DAY_MS,
  RETURN_POLICY,
  RETURN_STATE,
} from './constants/return.constant';
import { DisputeReturn } from './entities/dispute-return.entity';
import { handoverExpired } from './policies/return-clock.policy';
import { resumedHandoverDeadline } from './policies/return-clock.policy';
import type { ReturnGate } from './schemas/return.schema';

export async function ensureReturnCase(
  manager: EntityManager,
  final: DisputeFinalDecision,
) {
  if (final.refundPlan?.condition !== 'RETURN_REQUIRED')
    throw new ConflictException('Final decision does not require return');
  const existing = await manager.findOneBy(DisputeReturn, {
    remedyKey: final.remedyKey,
  });
  if (existing) return existing;
  const issue = await manager.findOneByOrFail(DisputeIssue, {
    id: final.issueId,
  });
  const dispute = await manager.findOneByOrFail(DisputeCase, {
    id: issue.caseId,
  });
  return manager.save(
    DisputeReturn,
    manager.create(DisputeReturn, {
      remedyKey: final.remedyKey,
      finalDecisionId: final.id,
      orderId: dispute.orderId,
      productId: issue.productId,
      buyerId: dispute.buyerId,
      shopId: dispute.shopId,
      state: RETURN_STATE.WAITING_LABEL,
      mode: null,
      labelCode: null,
      instructions: null,
      labelNotifiedAt: null,
      handoverBy: null,
      handoverAt: null,
      deliveredAt: null,
      inspectionDueAt: null,
      readyAt: null,
      refundLimit: null,
      readyReason: null,
      obstacleReason: null,
      obstacleReportedAt: null,
      obstacleAt: null,
      pausedAt: null,
      remainingMs: null,
      objectionReason: null,
      objectionAt: null,
      objectionDueAt: null,
      extensionReason: null,
      extendedAt: null,
      packingMissing: false,
      timelyHandoverReviewRequired: false,
      labelReplacementRequired: false,
      calendarMissing: false,
      obstaclePending: false,
      objectionOverdueAt: null,
    }),
  );
}

export async function installReturnLabel(
  manager: EntityManager,
  row: DisputeReturn,
  input: {
    mode: ReconciliationMode;
    waybillCode: string;
    instructions: string;
  },
  now: Date,
) {
  if (!input.waybillCode.trim() || !input.instructions.trim())
    throw new ConflictException('Valid label and instructions required');
  if (row.labelCode) {
    if (
      row.labelCode !== input.waybillCode ||
      row.mode !== input.mode ||
      row.instructions !== input.instructions
    )
      throw new ConflictException('Return label already installed');
    return row;
  }
  if (row.state !== RETURN_STATE.WAITING_LABEL)
    throw new ConflictException('Return is not awaiting label');
  row.mode = input.mode;
  row.labelCode = input.waybillCode;
  row.instructions = input.instructions;
  row.labelNotifiedAt = now;
  row.handoverBy = new Date(
    now.getTime() + RETURN_POLICY.HANDOVER_DAYS * RETURN_DAY_MS,
  );
  row.state = RETURN_STATE.AWAITING_HANDOVER;
  return manager.save(row);
}

/** Trusted booking lifecycle only: confirmed unusable carrier label, never a buyer report. */
export async function pauseReturnForCarrier(
  manager: EntityManager,
  row: DisputeReturn,
  now: Date,
  reason: string,
) {
  if (
    row.handoverAt ||
    !row.labelCode ||
    !row.handoverBy ||
    (row.state === RETURN_STATE.AWAITING_HANDOVER && now > row.handoverBy) ||
    !reason.trim() ||
    (row.state !== RETURN_STATE.AWAITING_HANDOVER &&
      row.state !== RETURN_STATE.PAUSED)
  )
    throw new ConflictException(
      'Carrier label cannot be paused in this return phase',
    );
  if (row.state !== RETURN_STATE.PAUSED) {
    row.remainingMs = Math.max(0, row.handoverBy.getTime() - now.getTime());
    row.obstacleAt = now;
    row.pausedAt = now;
  }
  row.obstacleReason = reason;
  row.obstaclePending = false;
  row.labelReplacementRequired = true;
  row.state = RETURN_STATE.PAUSED;
  return manager.save(row);
}

/** Call only after the booking layer confirms the old parcel is cancelled. */
export async function replaceReturnLabel(
  manager: EntityManager,
  row: DisputeReturn,
  input: {
    mode: ReconciliationMode;
    waybillCode: string;
    instructions: string;
  },
  now: Date,
) {
  if (
    row.state !== RETURN_STATE.PAUSED ||
    !row.labelReplacementRequired ||
    row.handoverAt ||
    input.mode !== row.mode ||
    !input.waybillCode.trim() ||
    !input.instructions.trim() ||
    input.waybillCode === row.labelCode ||
    row.remainingMs === null
  )
    throw new ConflictException(
      'Confirmed cancelled return label required before replacement',
    );
  row.labelCode = input.waybillCode;
  row.instructions = input.instructions;
  row.labelNotifiedAt = now;
  row.handoverBy = resumedHandoverDeadline(Number(row.remainingMs), now);
  row.labelReplacementRequired = false;
  row.state = RETURN_STATE.AWAITING_HANDOVER;
  return manager.save(row);
}

export async function reconcileReturnClock(
  manager: EntityManager,
  row: DisputeReturn,
  now: Date,
) {
  if (handoverExpired(row, now)) {
    row.state = RETURN_STATE.EXPIRED;
    const final = await manager.findOneByOrFail(DisputeFinalDecision, {
      id: row.finalDecisionId,
    });
    await notifyDispute(
      manager,
      final.issueId,
      DISPUTE_ACTION.RETURN_UPDATED,
      now,
      'Return handover window expired; unexecuted return claim closed',
      `RETURN_EXPIRED:${row.id}`,
    );
  }
  if (row.state === RETURN_STATE.INSPECTION && row.deliveredAt) {
    row.inspectionDueAt ??= await fulfillmentDeadline(
      manager,
      row.deliveredAt,
      RETURN_POLICY.INSPECTION_BUSINESS_DAYS,
    );
    row.calendarMissing = !row.inspectionDueAt;
    if (row.inspectionDueAt && now > row.inspectionDueAt) {
      row.state = RETURN_STATE.READY;
      row.readyAt = row.inspectionDueAt;
      row.readyReason = 'INSPECTION_WITHOUT_OBJECTION';
    }
  }
  if (row.state === RETURN_STATE.OBJECTION && row.objectionAt) {
    row.objectionDueAt ??= await fulfillmentDeadline(
      manager,
      row.objectionAt,
      row.extendedAt
        ? RETURN_POLICY.MAX_OBJECTION_BUSINESS_DAYS
        : RETURN_POLICY.OBJECTION_BUSINESS_DAYS,
    );
    row.calendarMissing = !row.objectionDueAt;
    if (
      row.objectionDueAt &&
      now > row.objectionDueAt &&
      !row.objectionOverdueAt
    ) {
      row.objectionOverdueAt = now;
      const final = await manager.findOneByOrFail(DisputeFinalDecision, {
        id: row.finalDecisionId,
      });
      await notifyDispute(
        manager,
        final.issueId,
        DISPUTE_ACTION.RETURN_UPDATED,
        now,
        'Return objection review overdue; Admin resolution required',
        `RETURN_REVIEW_OVERDUE:${row.id}`,
      );
    }
  }
  return manager.save(row);
}

export async function returnExecutionGate(
  manager: EntityManager,
  final: DisputeFinalDecision,
  now: Date,
): Promise<ReturnGate> {
  const row = await reconcileReturnClock(
    manager,
    await ensureReturnCase(manager, final),
    now,
  );
  const issue = await manager.findOneByOrFail(DisputeIssue, {
    id: final.issueId,
  });
  const dispute = await manager.findOneByOrFail(DisputeCase, {
    id: issue.caseId,
  });
  if (
    row.orderId !== dispute.orderId ||
    row.productId !== issue.productId ||
    row.buyerId !== dispute.buyerId ||
    row.shopId !== dispute.shopId ||
    row.remedyKey !== final.remedyKey ||
    final.refundPlan?.condition !== 'RETURN_REQUIRED'
  )
    throw new ConflictException('Return does not match final entitlement');
  const limit = row.refundLimit ?? final.refundPlan.amount;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 0 ||
    limit > final.refundPlan.amount
  )
    throw new ConflictException('Invalid return refund limit');
  const timely =
    row.handoverAt && row.handoverBy && row.handoverAt <= row.handoverBy;
  return {
    status:
      row.state === RETURN_STATE.EXPIRED
        ? 'CLOSED'
        : row.state === RETURN_STATE.READY && row.readyAt && row.mode && timely
          ? 'READY'
          : 'PENDING',
    amount: row.state === RETURN_STATE.EXPIRED ? 0 : limit,
    at: row.readyAt,
    mode: row.mode,
  };
}
