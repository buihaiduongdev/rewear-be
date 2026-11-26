import { EntityManager } from 'typeorm';

import {
  DISPUTE_PARTY,
  DISPUTE_RESPONSIBILITY,
} from '../constants/dispute.constant';
import { REFUND_BLOCK } from '../constants/refund-execution.constant';
import { DISPUTE_REFUND_CONDITION as CONDITION } from '../constants/refund.constant';
import { decisionFingerprint } from '../dispute-decision-review';
import { DisputeFinalDecision } from '../entities/dispute-final-decision.entity';
import { DisputeRefundConsent } from '../entities/dispute-refund-consent.entity';
import type { RefundBlock } from '../schemas/refund-execution.schema';
import { CARRIER_DIRECTION } from './constants/return-exception.constant';
import { DisputeReturnException } from './entities/dispute-return-exception.entity';
import { returnExceptionGate } from './return-exception-gate';
import { returnExecutionGate } from './return.lifecycle';

export function exactRefundPlanToken(final: DisputeFinalDecision) {
  return decisionFingerprint({
    id: final.id,
    remedyKey: final.remedyKey,
    refundPlan: final.refundPlan,
  });
}

export async function resolveRefundCondition(
  manager: EntityManager,
  final: DisputeFinalDecision,
  now: Date,
) {
  const plan = final.refundPlan!;
  let gate = await returnExceptionGate(manager, final);
  if (!gate && plan.condition === CONDITION.RETURN_REQUIRED)
    gate = await returnExecutionGate(manager, final, now);
  const carrierSource =
    final.responsibility === DISPUTE_RESPONSIBILITY.CARRIER
      ? await manager.findOneBy(DisputeReturnException, {
          remedyKey: final.remedyKey,
          direction: CARRIER_DIRECTION.OUTBOUND,
        })
      : null;
  const liabilityEstablished =
    final.responsibility === DISPUTE_RESPONSIBILITY.SELLER || !!carrierSource;
  let blockedReason: RefundBlock | null = liabilityEstablished
    ? null
    : REFUND_BLOCK.LIABILITY_REVIEW;
  const needsConsent =
    plan.condition === CONDITION.PARTIAL_AGREEMENT ||
    plan.condition === CONDITION.SELLER_WAIVER;
  if (!blockedReason && needsConsent) {
    const consents = await manager.find(DisputeRefundConsent, {
      where: {
        finalDecisionId: final.id,
        planFingerprint: exactRefundPlanToken(final),
      },
    });
    const agreed = new Set(consents.map((row) => row.party));
    const satisfied =
      agreed.has(DISPUTE_PARTY.SELLER) &&
      (plan.condition === CONDITION.SELLER_WAIVER ||
        agreed.has(DISPUTE_PARTY.BUYER));
    if (!satisfied) blockedReason = REFUND_BLOCK.CONSENT_PENDING;
  }
  if (!blockedReason && gate?.status === 'PENDING')
    blockedReason = REFUND_BLOCK.CONDITIONS_PENDING;
  if (
    !blockedReason &&
    !gate &&
    !needsConsent &&
    plan.condition !== CONDITION.MISSING_ITEM
  )
    blockedReason = REFUND_BLOCK.CONDITIONS_PENDING;
  return { gate, blockedReason, carrierMode: carrierSource?.mode ?? null };
}
