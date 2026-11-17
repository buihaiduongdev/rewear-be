import { DISPUTE_APPEAL_ELIGIBILITY } from './constants/dispute.constant';

export function classifyAppealEligibility(
  filedAt: Date,
  appealUntil: Date | null,
) {
  if (!appealUntil) return DISPUTE_APPEAL_ELIGIBILITY.PENDING_CALENDAR;
  return filedAt <= appealUntil
    ? DISPUTE_APPEAL_ELIGIBILITY.ACCEPTED
    : DISPUTE_APPEAL_ELIGIBILITY.OUT_OF_TIME;
}

export function appealWindowEnded(now: Date, appealUntil: Date | null) {
  return Boolean(appealUntil && now > appealUntil);
}
