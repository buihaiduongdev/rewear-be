import { EntityManager, In } from 'typeorm';

import { ORDER_STATUS } from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities/order.entity';

import {
  DISPUTE_ACTION,
  DISPUTE_CASE_STATE,
  DISPUTE_DECISION_OUTCOME,
  DISPUTE_ISSUE_STATE,
  OPEN_DISPUTE_STATES,
} from './constants/dispute.constant';
import { notifyDispute, recordDisputeAction } from './dispute.lifecycle';
import { DisputeFinalDecision } from './entities/dispute-appeal.entity';
import { DisputeDecision } from './entities/dispute-decision.entity';
import { DisputeCase, DisputeIssue } from './entities/dispute.entity';

export async function restoreDisputeCaseIfClear(
  manager: EntityManager,
  caseId: string,
) {
  const stillHeld = await manager.existsBy(DisputeIssue, {
    caseId,
    status: In([...OPEN_DISPUTE_STATES]),
  });
  if (stillHeld) return;
  const row = await manager.findOneByOrFail(DisputeCase, { id: caseId });
  row.state = DISPUTE_CASE_STATE.CLOSED;
  await manager.save(row);
  const order = await manager.findOneByOrFail(Order, { id: row.orderId });
  if (order.status === ORDER_STATUS.DISPUTE) {
    order.status = row.previousOrderStatus;
    await manager.save(order);
  }
}

export async function saveFinalDisputeDecision(
  manager: EntityManager,
  decision: DisputeDecision,
  issue: DisputeIssue,
  result: Pick<
    DisputeFinalDecision,
    | 'source'
    | 'actorId'
    | 'outcome'
    | 'responsibility'
    | 'reason'
    | 'evidenceAssessment'
    | 'sameAdminReason'
    | 'appealIds'
    | 'requestId'
    | 'requestFingerprint'
    | 'reviewToken'
    | 'reviewLate'
  >,
  now: Date,
) {
  const final = await manager.save(
    DisputeFinalDecision,
    manager.create(DisputeFinalDecision, {
      ...result,
      decisionId: decision.id,
      issueId: issue.id,
      itemPrice: decision.itemPrice,
      remedyKey: decision.remedyKey,
      finalizedAt: now,
    }),
  );
  issue.status =
    result.outcome === DISPUTE_DECISION_OUTCOME.REJECT_CLAIM
      ? DISPUTE_ISSUE_STATE.RESOLVED_NO_REFUND
      : DISPUTE_ISSUE_STATE.AWAITING_EXECUTION;
  await manager.save(issue);
  await recordDisputeAction(
    manager,
    issue.id,
    DISPUTE_ACTION.FINALIZED,
    result.actorId,
    now,
    result.reason,
  );
  await notifyDispute(
    manager,
    issue.id,
    DISPUTE_ACTION.FINALIZED,
    now,
    result.reason,
  );
  await restoreDisputeCaseIfClear(manager, issue.caseId);
  return final;
}
