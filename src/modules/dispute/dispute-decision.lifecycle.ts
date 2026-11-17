import { EntityManager } from 'typeorm';

import { fulfillmentDeadline } from '@/modules/shipment/utils/fulfillment-calendar';

import { DISPUTE_POLICY } from './constants/dispute.constant';
import { DisputeDecision } from './entities/dispute-decision.entity';

export async function populateDecisionAppealDeadline(
  manager: EntityManager,
  issueId: string,
) {
  const decision = await manager.findOneByOrFail(DisputeDecision, { issueId });
  if (decision.appealUntil) return decision;
  const deadline = await fulfillmentDeadline(
    manager,
    decision.notifiedAt,
    DISPUTE_POLICY.APPEAL_BUSINESS_DAYS,
  );
  if (!deadline) return decision;
  // Only the derived deadline projection changes, never the original decision/basis.
  await manager.update(DisputeDecision, decision.id, {
    appealUntil: deadline,
    calendarMissing: false,
  });
  return { ...decision, appealUntil: deadline, calendarMissing: false };
}
