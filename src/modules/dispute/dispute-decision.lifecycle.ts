import { EntityManager } from 'typeorm';

import { businessDeadline } from '@/modules/shipment/utils/business-calendar';

import { DISPUTE_POLICY } from './constants/dispute.constant';
import { DisputeDecision } from './entities/dispute-decision.entity';

export async function populateDecisionAppealDeadline(
  manager: EntityManager,
  issueId: string,
) {
  const decision = await manager.findOneByOrFail(DisputeDecision, { issueId });
  if (decision.appealUntil) return decision;
  const deadline = businessDeadline(
    decision.notifiedAt,
    DISPUTE_POLICY.APPEAL_BUSINESS_DAYS,
  );
  // Only the derived deadline projection changes, never the original decision/basis.
  await manager.update(DisputeDecision, decision.id, {
    appealUntil: deadline,
    calendarMissing: false,
  });
  return { ...decision, appealUntil: deadline, calendarMissing: false };
}
