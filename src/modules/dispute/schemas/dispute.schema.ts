import z from 'zod';

import { trimmedTextSchema } from '@/common/schemas/request.schema';

import {
  DISPUTE_ACTION,
  DISPUTE_CASE_STATE,
  DISPUTE_EVIDENCE_MIME_TYPES,
  DISPUTE_EVIDENCE_STATE,
  DISPUTE_EVIDENCE_TAG,
  DISPUTE_ISSUE_STATE,
  DISPUTE_KIND,
  DISPUTE_NOTICE_AUDIENCE,
  DISPUTE_PARTY,
  DISPUTE_POLICY,
} from '../constants/dispute.constant';

const evidenceIdsSchema = z
  .array(z.uuid())
  .max(DISPUTE_POLICY.MAX_EVIDENCE_PER_REQUEST)
  .refine((ids) => new Set(ids).size === ids.length, 'Duplicate evidence');
export const openDisputeIssueSchema = z.strictObject({
  productId: z.uuid(),
  kind: z.enum(DISPUTE_KIND),
  description: trimmedTextSchema.min(1).max(2000),
  evidenceIds: evidenceIdsSchema.default([]),
});
export const disputeSupplementSchema = z.strictObject({
  evidenceIds: evidenceIdsSchema.min(1),
});
export const disputeReplySchema = z.strictObject({
  requestId: z.uuid(),
  text: trimmedTextSchema.min(1).max(2000),
  evidenceIds: evidenceIdsSchema.default([]),
});
export const disputeFileSchema = z
  .strictObject({
    mimeType: z.enum(DISPUTE_EVIDENCE_MIME_TYPES),
    sizeBytes: z.number().int().positive(),
  })
  .refine(
    (data) =>
      data.sizeBytes <=
      (data.mimeType.startsWith('video/')
        ? DISPUTE_POLICY.MAX_VIDEO_BYTES
        : DISPUTE_POLICY.MAX_IMAGE_BYTES),
    'Evidence exceeds size limit',
  );
export const disputeUploadSchema = z.strictObject({
  mediaId: z.uuid(),
  tags: z
    .array(z.enum(DISPUTE_EVIDENCE_TAG))
    .min(1)
    .max(7)
    .refine((tags) => new Set(tags).size === tags.length),
});
export const disputeExtensionSchema = z.strictObject({
  reason: trimmedTextSchema.min(1).max(1000),
});
export const disputeListSchema = z.strictObject({
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

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
