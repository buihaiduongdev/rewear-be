import {
  DISPUTE_EVIDENCE_TAG,
  DISPUTE_KIND,
} from '../constants/dispute.constant';
import type { DisputeKind } from '../types/dispute.type';

export function hasMinimumDisputeEvidence(
  kind: DisputeKind,
  tags: readonly string[],
): boolean {
  const present = new Set(tags);
  if (kind === DISPUTE_KIND.MISSING_ITEM)
    return [
      DISPUTE_EVIDENCE_TAG.PARCEL,
      DISPUTE_EVIDENCE_TAG.LABEL,
      DISPUTE_EVIDENCE_TAG.RECEIVED_ITEMS,
    ].every((tag) => present.has(tag));
  if (kind === DISPUTE_KIND.TRANSIT_DAMAGE)
    return [
      DISPUTE_EVIDENCE_TAG.PARCEL,
      DISPUTE_EVIDENCE_TAG.LABEL,
      DISPUTE_EVIDENCE_TAG.DAMAGE,
    ].every((tag) => present.has(tag));
  return present.has(DISPUTE_EVIDENCE_TAG.ISSUE);
}
