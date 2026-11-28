import ms from 'ms';

export const DISPUTE_CASE_STATE = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

export const DISPUTE_ISSUE_STATE = {
  ACTIVE: 'ACTIVE',
  AWAITING_APPEAL: 'AWAITING_APPEAL',
  APPEAL_REVIEW: 'APPEAL_REVIEW',
  AWAITING_EXECUTION: 'AWAITING_EXECUTION',
  RESOLVED_NO_REFUND: 'RESOLVED_NO_REFUND',
  RESOLVED_REFUND: 'RESOLVED_REFUND',
} as const;

export const OPEN_DISPUTE_STATES = [
  DISPUTE_ISSUE_STATE.ACTIVE,
  DISPUTE_ISSUE_STATE.AWAITING_APPEAL,
  DISPUTE_ISSUE_STATE.APPEAL_REVIEW,
  DISPUTE_ISSUE_STATE.AWAITING_EXECUTION,
] as const;

export const DISPUTE_KIND = {
  WRONG_ITEM: 'WRONG_ITEM',
  NOT_AS_DESCRIBED: 'NOT_AS_DESCRIBED',
  MISSING_ITEM: 'MISSING_ITEM',
  TRANSIT_DAMAGE: 'TRANSIT_DAMAGE',
} as const;

export const DISPUTE_PARTY = {
  BUYER: 'BUYER',
  SELLER: 'SELLER',
} as const;

export const DISPUTE_EVIDENCE_TAG = {
  ISSUE: 'ISSUE',
  UNBOX: 'UNBOX',
  PARCEL: 'PARCEL',
  LABEL: 'LABEL',
  RECEIVED_ITEMS: 'RECEIVED_ITEMS',
  DAMAGE: 'DAMAGE',
  PACKING: 'PACKING',
  RETURN_ITEM: 'RETURN_ITEM',
  RETURN_PARCEL: 'RETURN_PARCEL',
  RETURN_LABEL: 'RETURN_LABEL',
} as const;

export const DISPUTE_EVIDENCE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
] as const;

export const DISPUTE_DECISION_OUTCOME = {
  UPHOLD_CLAIM: 'UPHOLD_CLAIM',
  REJECT_CLAIM: 'REJECT_CLAIM',
  REQUIRE_RETURN: 'REQUIRE_RETURN',
} as const;

export const DISPUTE_RESPONSIBILITY = {
  SELLER: 'SELLER',
  BUYER: 'BUYER',
  CARRIER: 'CARRIER',
  UNDETERMINED: 'UNDETERMINED',
} as const;

export const DISPUTE_POLICY = {
  BATCH_SIZE: 100,
  SELLER_RESPONSE_BUSINESS_DAYS: 1,
  REVIEW_BUSINESS_DAYS: 3,
  MAX_REVIEW_BUSINESS_DAYS: 5,
  APPEAL_BUSINESS_DAYS: 2,
  APPEAL_REVIEW_BUSINESS_DAYS: 2,
  MAX_EVIDENCE_PER_ORDER_USER: 30,
  MAX_EVIDENCE_PER_REQUEST: 10,
  MAX_IMAGE_BYTES: 10 * 1024 * 1024,
  MAX_VIDEO_BYTES: 100 * 1024 * 1024,
} as const;

export const RETURN_STATE = {
  WAITING_LABEL: 'WAITING_LABEL',
  AWAITING_HANDOVER: 'AWAITING_HANDOVER',
  IN_TRANSIT: 'IN_TRANSIT',
  READY: 'READY',
  EXPIRED: 'EXPIRED',
} as const;

export const RETURN_POLICY = {
  HANDOVER_MS: ms('5d'),
  PAYMENT_TYPE: 1,
  COD_AMOUNT: 0,
  DECLARED_VALUE: 0,
  STANDARD_SERVICE: 2,
  HEAVY_SERVICE: 5,
  HEAVY_PARCEL_GRAMS: 20_000,
  CONTENT: 'Rewear return parcel',
} as const;

export const RETURN_BOOKING_INSTRUCTIONS =
  'Prepaid GHN return label; hand over parcel within 5 days.';

const VIETNAM_UTC_OFFSET_MS = ms('7h');

export function businessDeadline(receivedAt: Date, days: number): Date {
  if (!Number.isFinite(receivedAt.getTime())) {
    throw new RangeError('Received date must be valid');
  }
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new RangeError('Business days must be a positive safe integer');
  }
  const localDay = new Date(receivedAt.getTime() + VIETNAM_UTC_OFFSET_MS);
  localDay.setUTCHours(0, 0, 0, 0);
  let remaining = days;
  while (remaining > 0) {
    localDay.setUTCDate(localDay.getUTCDate() + 1);
    const weekday = localDay.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      remaining -= 1;
    }
  }
  localDay.setUTCHours(17, 0, 0, 0);
  return new Date(localDay.getTime() - VIETNAM_UTC_OFFSET_MS);
}

export function hasMinimumDisputeEvidence(
  kind: string,
  tags: readonly string[],
): boolean {
  const present = new Set(tags);
  if (present.has(DISPUTE_EVIDENCE_TAG.UNBOX)) return true;
  if (kind === DISPUTE_KIND.MISSING_ITEM) {
    return [
      DISPUTE_EVIDENCE_TAG.PARCEL,
      DISPUTE_EVIDENCE_TAG.LABEL,
      DISPUTE_EVIDENCE_TAG.RECEIVED_ITEMS,
    ].every((tag) => present.has(tag));
  }
  if (kind === DISPUTE_KIND.TRANSIT_DAMAGE) {
    return [
      DISPUTE_EVIDENCE_TAG.PARCEL,
      DISPUTE_EVIDENCE_TAG.LABEL,
      DISPUTE_EVIDENCE_TAG.DAMAGE,
    ].every((tag) => present.has(tag));
  }
  return present.has(DISPUTE_EVIDENCE_TAG.ISSUE);
}
