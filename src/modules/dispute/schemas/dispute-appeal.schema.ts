import z from 'zod';

import { trimmedTextSchema } from '@/common/schemas/request.schema';

import {
  DISPUTE_APPEAL_ELIGIBILITY,
  DISPUTE_FINAL_SOURCE,
  DISPUTE_POLICY,
} from '../constants/dispute.constant';
import {
  disputeAppealReviewViewSchema,
  disputeAppealViewSchema,
  disputeFinalDecisionViewSchema,
} from './dispute-appeal-view.schema';
import { disputeDecisionViewSchema } from './dispute-decision-view.schema';
import { disputeDecisionInputSchema } from './dispute-decision.schema';
import {
  disputeEvidenceViewSchema,
  disputeIssueViewSchema,
} from './dispute-view.schema';

export const disputeAppealAdminReviewSchema = z.object({
  reviewToken: z.string(),
  issue: disputeIssueViewSchema,
  decision: disputeDecisionViewSchema,
  appeals: z.array(disputeAppealViewSchema),
  evidence: z.array(disputeEvidenceViewSchema),
  review: disputeAppealReviewViewSchema.nullable(),
  finalDecision: disputeFinalDecisionViewSchema.nullable(),
});

export const disputeAppealInputSchema = z
  .strictObject({
    requestId: z.uuid(),
    reason: trimmedTextSchema.min(1).max(2000),
    specificError: trimmedTextSchema
      .min(1)
      .max(2000)
      .nullish()
      .transform((value) => value ?? null),
    evidenceIds: z
      .array(z.uuid())
      .max(DISPUTE_POLICY.MAX_EVIDENCE_PER_REQUEST)
      .refine((ids) => new Set(ids).size === ids.length)
      .default([]),
  })
  .refine(
    (data) => data.specificError !== null || data.evidenceIds.length > 0,
    'Appeal requires new evidence or a specific error',
  );
export const disputeAppealConclusionSchema =
  disputeDecisionInputSchema.safeExtend({
    sameAdminReason: trimmedTextSchema
      .min(1)
      .max(2000)
      .nullish()
      .transform((value) => value ?? null),
  });

export type DisputeAppealEligibility =
  (typeof DISPUTE_APPEAL_ELIGIBILITY)[keyof typeof DISPUTE_APPEAL_ELIGIBILITY];
export type DisputeFinalSource =
  (typeof DISPUTE_FINAL_SOURCE)[keyof typeof DISPUTE_FINAL_SOURCE];
export type DisputeAppealInput = z.output<typeof disputeAppealInputSchema>;
export type DisputeAppealConclusionInput = z.output<
  typeof disputeAppealConclusionSchema
>;
