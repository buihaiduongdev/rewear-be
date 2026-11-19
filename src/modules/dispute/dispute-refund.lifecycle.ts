import { EntityManager } from 'typeorm';

import { DISPUTE_DECISION_OUTCOME } from './constants/dispute.constant';
import {
  REFUND_BLOCK,
  REFUND_STATE,
} from './constants/refund-execution.constant';
import { DisputeFinalDecision } from './entities/dispute-appeal.entity';
import { DisputeRefund } from './entities/dispute-refund.entity';
import { DisputeCase, DisputeIssue } from './entities/dispute.entity';

/** Enqueue in the final-decision transaction; execution failure must never erase the decision. */
export async function queueDisputeRefund(
  manager: EntityManager,
  final: DisputeFinalDecision,
) {
  if (final.outcome === DISPUTE_DECISION_OUTCOME.REJECT_CLAIM) return null;
  const replay = await manager.findOneBy(DisputeRefund, {
    finalDecisionId: final.id,
  });
  if (replay) return replay;
  const issue = await manager.findOneByOrFail(DisputeIssue, {
    id: final.issueId,
  });
  const row = await manager.findOneByOrFail(DisputeCase, { id: issue.caseId });
  return manager.save(
    DisputeRefund,
    manager.create(DisputeRefund, {
      finalDecisionId: final.id,
      orderId: row.orderId,
      buyerId: row.buyerId,
      shopId: row.shopId,
      remedyKey: final.remedyKey,
      status: REFUND_STATE.PENDING,
      blockedReason: final.refundPlan
        ? REFUND_BLOCK.PAYMENT_UNVERIFIED
        : REFUND_BLOCK.PLAN_MISSING,
      mode: null,
      eligibleAt: null,
      dueAt: null,
      completedAt: null,
      alertedAt: null,
      responseDueAt: null,
      respondedAt: null,
    }),
  );
}
