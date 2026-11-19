import { ConflictException } from '@nestjs/common';

import {
  DISPUTE_DECISION_OUTCOME,
  DISPUTE_KIND,
} from '../constants/dispute.constant';
import { DISPUTE_REFUND_CONDITION as CONDITION } from '../constants/refund.constant';
import { disputeRefundPlanSchema } from '../schemas/dispute-refund-plan.schema';
import type { DisputeDecisionOutcome } from '../types/dispute-decision.type';
import type { DisputeRefundPlan } from '../types/dispute-refund-plan.type';
import type { DisputeKind } from '../types/dispute.type';

/** Legacy decisions without a plan never establish a financial entitlement. */
export function validateDisputeRefundPlan(
  kind: DisputeKind,
  outcome: DisputeDecisionOutcome,
  itemPrice: number,
  plan?: DisputeRefundPlan | null,
): boolean {
  if (plan == null) return true;
  if (outcome === DISPUTE_DECISION_OUTCOME.REJECT_CLAIM) return false;
  if (!disputeRefundPlanSchema.safeParse(plan).success) return false;
  if (!Number.isSafeInteger(itemPrice) || plan.amount > itemPrice) return false;
  if (
    (outcome === DISPUTE_DECISION_OUTCOME.REQUIRE_RETURN) !==
    (plan.condition === CONDITION.RETURN_REQUIRED)
  )
    return false;
  if (
    plan.condition === CONDITION.MISSING_ITEM &&
    kind !== DISPUTE_KIND.MISSING_ITEM
  )
    return false;
  const missingItemConditionAllowed =
    plan.condition === CONDITION.MISSING_ITEM ||
    plan.condition === CONDITION.PARTIAL_AGREEMENT;
  if (kind === DISPUTE_KIND.MISSING_ITEM && !missingItemConditionAllowed)
    return false;
  return plan.condition === CONDITION.PARTIAL_AGREEMENT
    ? plan.amount < itemPrice
    : plan.amount === itemPrice;
}

export function assertDisputeRefundPlan(
  kind: DisputeKind,
  outcome: DisputeDecisionOutcome,
  itemPrice: number,
  plan?: DisputeRefundPlan | null,
): void {
  if (!validateDisputeRefundPlan(kind, outcome, itemPrice, plan))
    throw new ConflictException(
      'Refund plan is incompatible with the finding or snapshotted item price',
    );
}
