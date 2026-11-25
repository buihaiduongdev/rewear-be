import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { vndAmountSchema } from '@/common/schemas/money.schema';
import { trimmedTextSchema } from '@/common/schemas/request.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';

import {
  DISPUTE_CASE_STATE,
  DISPUTE_DECISION_OUTCOME,
  DISPUTE_EVIDENCE_MIME_TYPES,
  DISPUTE_EVIDENCE_TAG,
  DISPUTE_ISSUE_STATE,
  DISPUTE_KIND,
  DISPUTE_PARTY,
  DISPUTE_POLICY,
  DISPUTE_RESPONSIBILITY,
} from '../constants/dispute.constant';
import { RETURN_STATE } from '../returns/constants/return.constant';

export const disputeCaseStateSchema = z.enum(DISPUTE_CASE_STATE);
export const disputeIssueStateSchema = z.enum(DISPUTE_ISSUE_STATE);
export const disputeKindSchema = z.enum(DISPUTE_KIND);
export const disputePartySchema = z.enum(DISPUTE_PARTY);
export const disputeDecisionOutcomeSchema = z.enum(DISPUTE_DECISION_OUTCOME);
export const disputeResponsibilitySchema = z.enum(DISPUTE_RESPONSIBILITY);
export const returnStateSchema = z.enum(RETURN_STATE);

const evidenceIdsSchema = z
  .array(z.uuid())
  .max(DISPUTE_POLICY.MAX_EVIDENCE_PER_REQUEST)
  .refine((ids) => new Set(ids).size === ids.length, 'Duplicate evidence');

export const openDisputeIssueSchema = z.strictObject({
  productId: z.uuid(),
  kind: disputeKindSchema,
  description: trimmedTextSchema.min(1).max(2000),
  evidenceIds: evidenceIdsSchema.min(1),
});

export const disputeReplySchema = z.strictObject({
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

export const disputeDecisionInputSchema = z
  .strictObject({
    outcome: disputeDecisionOutcomeSchema,
    responsibility: disputeResponsibilitySchema,
    reason: trimmedTextSchema.min(1).max(2000),
    refundAmount: z.number().int().positive().safe().nullish(),
  })
  .refine(
    (data) =>
      data.outcome !== DISPUTE_DECISION_OUTCOME.REJECT_CLAIM ||
      data.refundAmount == null,
    {
      message: 'Rejected claims cannot authorize a refund',
      path: ['refundAmount'],
    },
  );

export const disputeAppealInputSchema = z.strictObject({
  reason: trimmedTextSchema.min(1).max(2000),
  evidenceIds: evidenceIdsSchema.default([]),
});

export const returnParcelSchema = z.strictObject({
  weightGrams: z.number().int().min(1).max(50_000),
  lengthCm: z.number().int().min(1).max(200),
  widthCm: z.number().int().min(1).max(200),
  heightCm: z.number().int().min(1).max(200),
});

export const returnLabelInputSchema = z
  .strictObject({
    mode: z.enum(RECONCILIATION_MODE).default(RECONCILIATION_MODE.SIMULATION),
    waybillCode: trimmedTextSchema.min(1).max(128).optional(),
    instructions: trimmedTextSchema.min(1).max(1000).optional(),
    parcel: returnParcelSchema.optional(),
  })
  .refine((data) => Boolean(data.waybillCode || data.parcel), {
    message: 'Provide either waybillCode or parcel dimensions for GHN booking',
  });

export const returnCarrierStatusSchema = z.strictObject({
  status: z.enum(['IN_TRANSIT', 'DELIVERED']),
  observedAt: dateTimeSchema.optional(),
});

export const disputeEvidenceViewSchema = z.object({
  id: z.uuid(),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  tags: z.array(z.string()),
});

export const disputeIssueViewSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  productId: z.uuid(),
  kind: disputeKindSchema,
  description: z.string(),
  evidenceIds: z.array(z.uuid()),
  status: disputeIssueStateSchema,
  sellerRespondBy: dateTimeSchema,
  reviewDueAt: dateTimeSchema,
  maxReviewDueAt: dateTimeSchema,
  extendedAt: dateTimeSchema.nullable(),
  extensionReason: z.string().nullable(),
  reviewOverdue: z.boolean(),
  createdAt: dateTimeSchema,
});

export const disputeMessageViewSchema = z.object({
  id: z.uuid(),
  issueId: z.uuid(),
  actorId: z.uuid(),
  party: disputePartySchema,
  text: z.string(),
  evidenceIds: z.array(z.uuid()),
  createdAt: dateTimeSchema,
});

export const disputeDecisionViewSchema = z.object({
  id: z.uuid(),
  issueId: z.uuid(),
  actorId: z.uuid(),
  outcome: disputeDecisionOutcomeSchema,
  responsibility: disputeResponsibilitySchema,
  reason: z.string(),
  itemPrice: vndAmountSchema,
  refundAmount: vndAmountSchema.nullable(),
  decidedAt: dateTimeSchema,
  appealUntil: dateTimeSchema,
  finalizedAt: dateTimeSchema.nullable(),
  finalOutcome: disputeDecisionOutcomeSchema.nullable(),
  finalRefundAmount: vndAmountSchema.nullable(),
  finalReason: z.string().nullable(),
  finalActorId: z.uuid().nullable(),
});

export const disputeAppealViewSchema = z.object({
  id: z.uuid(),
  decisionId: z.uuid(),
  actorId: z.uuid(),
  party: disputePartySchema,
  reason: z.string(),
  evidenceIds: z.array(z.uuid()),
  filedAt: dateTimeSchema,
  reviewDueAt: dateTimeSchema,
  reviewOverdue: z.boolean(),
});

export const returnViewSchema = z.object({
  id: z.uuid(),
  decisionId: z.uuid(),
  orderId: z.uuid(),
  productId: z.uuid(),
  state: returnStateSchema,
  mode: z.enum(RECONCILIATION_MODE).nullable(),
  labelCode: z.string().nullable(),
  instructions: z.string().nullable(),
  handoverBy: dateTimeSchema.nullable(),
  handoverAt: dateTimeSchema.nullable(),
  deliveredAt: dateTimeSchema.nullable(),
  readyAt: dateTimeSchema.nullable(),
});

export const disputeCaseViewSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  buyerId: z.uuid(),
  shopId: z.uuid(),
  state: disputeCaseStateSchema,
  createdAt: dateTimeSchema,
  issues: z.array(disputeIssueViewSchema),
});

export const disputeCaseDetailSchema = disputeCaseViewSchema.extend({
  messages: z.array(disputeMessageViewSchema),
  evidence: z.array(disputeEvidenceViewSchema),
  decisions: z.array(disputeDecisionViewSchema),
  appeals: z.array(disputeAppealViewSchema),
  returns: z.array(returnViewSchema),
});

export const disputeDownloadSchema = z.object({
  url: z.url(),
  headers: z.record(z.string(), z.string()),
  expiresAt: dateTimeSchema,
});

export type DisputeCaseState = z.infer<typeof disputeCaseStateSchema>;
export type DisputeIssueState = z.infer<typeof disputeIssueStateSchema>;
export type DisputeKind = z.infer<typeof disputeKindSchema>;
export type DisputeParty = z.infer<typeof disputePartySchema>;
export type DisputeDecisionOutcome = z.infer<
  typeof disputeDecisionOutcomeSchema
>;
export type DisputeResponsibility = z.infer<typeof disputeResponsibilitySchema>;
export type ReturnState = z.infer<typeof returnStateSchema>;
export type OpenDisputeIssueInput = z.infer<typeof openDisputeIssueSchema>;
export type DisputeReplyInput = z.infer<typeof disputeReplySchema>;
export type DisputeUploadInput = z.infer<typeof disputeUploadSchema>;
export type DisputeDecisionInput = z.infer<typeof disputeDecisionInputSchema>;
export type DisputeAppealInput = z.infer<typeof disputeAppealInputSchema>;
export type ReturnParcelInput = z.infer<typeof returnParcelSchema>;
export type ReturnLabelInput = z.infer<typeof returnLabelInputSchema>;
export type ReturnCarrierStatusInput = z.infer<
  typeof returnCarrierStatusSchema
>;
