import type z from 'zod';

import type {
  DISPUTE_ACTION,
  DISPUTE_CASE_STATE,
  DISPUTE_EVIDENCE_STATE,
  DISPUTE_ISSUE_STATE,
  DISPUTE_KIND,
  DISPUTE_NOTICE_AUDIENCE,
  DISPUTE_PARTY,
} from '../constants/dispute.constant';
import type {
  disputeReplySchema,
  disputeSupplementSchema,
  disputeUploadSchema,
  openDisputeIssueSchema,
} from '../schemas/dispute.schema';

export type DisputeCaseState =
  (typeof DISPUTE_CASE_STATE)[keyof typeof DISPUTE_CASE_STATE];
export type DisputeIssueState =
  (typeof DISPUTE_ISSUE_STATE)[keyof typeof DISPUTE_ISSUE_STATE];
export type DisputeKind = (typeof DISPUTE_KIND)[keyof typeof DISPUTE_KIND];
export type DisputeParty = (typeof DISPUTE_PARTY)[keyof typeof DISPUTE_PARTY];
export type DisputeEvidenceState =
  (typeof DISPUTE_EVIDENCE_STATE)[keyof typeof DISPUTE_EVIDENCE_STATE];
export type DisputeAction =
  (typeof DISPUTE_ACTION)[keyof typeof DISPUTE_ACTION];
export type DisputeNoticeAudience =
  (typeof DISPUTE_NOTICE_AUDIENCE)[keyof typeof DISPUTE_NOTICE_AUDIENCE];
export type OpenDisputeIssueInput = z.output<typeof openDisputeIssueSchema>;
export type DisputeSupplementInput = z.output<typeof disputeSupplementSchema>;
export type DisputeReplyInput = z.output<typeof disputeReplySchema>;
export type DisputeUploadInput = z.output<typeof disputeUploadSchema>;
