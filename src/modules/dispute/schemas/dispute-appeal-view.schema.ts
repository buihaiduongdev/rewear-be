import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { vndAmountSchema } from '@/common/schemas/money.schema';

import {
  DISPUTE_APPEAL_ELIGIBILITY,
  DISPUTE_DECISION_OUTCOME,
  DISPUTE_FINAL_SOURCE,
  DISPUTE_PARTY,
  DISPUTE_RESPONSIBILITY,
} from '../constants/dispute.constant';
import { disputeRefundPlanSchema } from './dispute-refund-plan.schema';

export const disputeAppealViewSchema = z.object({
  id: z.uuid(),
  decisionId: z.uuid(),
  actorId: z.uuid(),
  party: z.enum(DISPUTE_PARTY),
  reason: z.string(),
  specificError: z.string().nullable(),
  evidenceIds: z.array(z.uuid()),
  filedAt: dateTimeSchema,
  eligibility: z.enum(DISPUTE_APPEAL_ELIGIBILITY),
});
export const disputeAppealReviewViewSchema = z.object({
  id: z.uuid(),
  decisionId: z.uuid(),
  reviewStartAt: dateTimeSchema.nullable(),
  reviewDueAt: dateTimeSchema.nullable(),
  calendarMissing: z.boolean(),
  reviewOverdue: z.boolean(),
  escalatedAt: dateTimeSchema.nullable(),
  escalationDueAt: dateTimeSchema.nullable(),
});
export const disputeFinalDecisionViewSchema = z.object({
  id: z.uuid(),
  decisionId: z.uuid(),
  issueId: z.uuid(),
  actorId: z.uuid().nullable(),
  source: z.enum(DISPUTE_FINAL_SOURCE),
  outcome: z.enum(DISPUTE_DECISION_OUTCOME),
  responsibility: z.enum(DISPUTE_RESPONSIBILITY),
  reason: z.string(),
  evidenceAssessment: z.string(),
  sameAdminReason: z.string().nullable(),
  itemPrice: vndAmountSchema,
  refundPlan: disputeRefundPlanSchema.nullish(),
  remedyKey: z.string(),
  appealIds: z.array(z.uuid()),
  finalizedAt: dateTimeSchema,
  reviewLate: z.boolean().nullable(),
});
