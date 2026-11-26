import { ConflictException } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { ORDER_STATUS } from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities';

import {
  DISPUTE_ACTION,
  DISPUTE_ISSUE_STATE,
} from '../constants/dispute.constant';
import { DISPUTE_CASE_STATE } from '../constants/dispute.constant';
import { REFUND_STATE } from '../constants/refund-execution.constant';
import { restoreDisputeCaseIfClear } from '../dispute-finalization.lifecycle';
import { notifyDispute, recordDisputeAction } from '../dispute.lifecycle';
import { DisputeCase } from '../entities/dispute-case.entity';
import { DisputeFinalDecision } from '../entities/dispute-final-decision.entity';
import { DisputeIssue } from '../entities/dispute-issue.entity';
import { DisputeRefund } from '../entities/dispute-refund.entity';
import type { DisputeAction } from '../schemas/dispute.schema';
import { DisputeReturn } from './entities/dispute-return.entity';

/** Repairs only technical expiry disproved by newly verified timely carrier movement. */
export async function recoverTimelyReturnRefunds(
  manager: EntityManager,
  row: DisputeReturn,
  _now: Date,
) {
  const refunds = await manager.find(DisputeRefund, {
    where: { remedyKey: row.remedyKey, status: REFUND_STATE.CLOSED_NO_REFUND },
  });
  const order = await manager.findOneByOrFail(Order, { id: row.orderId });
  if (order.status === ORDER_STATUS.CANCELLED)
    throw new ConflictException(
      'Cancelled order requires financial incident review',
    );
  for (const refund of refunds) {
    const final = await manager.findOneByOrFail(DisputeFinalDecision, {
      id: refund.finalDecisionId,
    });
    if (final.refundPlan?.condition !== 'RETURN_REQUIRED') continue;
    const issue = await manager.findOneByOrFail(DisputeIssue, {
      id: final.issueId,
    });
    if (issue.status !== DISPUTE_ISSUE_STATE.RESOLVED_NO_REFUND)
      throw new ConflictException(
        'Issue no longer matches expired return closure',
      );
    refund.status = REFUND_STATE.PENDING;
    refund.completedAt = null;
    refund.executionAmount = null;
    refund.eligibleAt = null;
    refund.dueAt = null;
    await manager.save(refund);
    issue.status = DISPUTE_ISSUE_STATE.AWAITING_EXECUTION;
    await manager.save(issue);
    const dispute = await manager.findOneByOrFail(DisputeCase, {
      id: issue.caseId,
    });
    dispute.state = DISPUTE_CASE_STATE.OPEN;
    await manager.save(dispute);
  }
  if (refunds.length) {
    order.status = ORDER_STATUS.DISPUTE;
    await manager.save(order);
  }
}

export async function closeExpiredReturnRefund(
  manager: EntityManager,
  refund: DisputeRefund,
  final: DisputeFinalDecision,
  issue: DisputeIssue,
  now: Date,
  reason = 'Return handover expired without verified obstacle; unexecuted refund closed, no wallet credit',
  action: DisputeAction = DISPUTE_ACTION.RETURN_EXPIRED,
) {
  refund.status = REFUND_STATE.CLOSED_NO_REFUND;
  refund.executionAmount = 0;
  refund.completedAt = now;
  refund.blockedReason = null;
  await manager.save(refund);
  issue.status = DISPUTE_ISSUE_STATE.RESOLVED_NO_REFUND;
  await manager.save(issue);
  await recordDisputeAction(manager, issue.id, action, null, now, reason);
  await notifyDispute(manager, issue.id, action, now, reason, final.id);
  await restoreDisputeCaseIfClear(manager, issue.caseId);
}
