import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { vndAmountSchema } from '@/common/schemas/money.schema';

import {
  DISPUTE_DECISION_OUTCOME,
  DISPUTE_RESPONSIBILITY,
} from '../constants/dispute.constant';
import { disputeRefundPlanSchema } from './dispute-refund-plan.schema';

export const disputeDecisionViewSchema = z.object({
  id: z.uuid(),
  issueId: z.uuid(),
  actorId: z.uuid(),
  outcome: z.enum(DISPUTE_DECISION_OUTCOME),
  responsibility: z.enum(DISPUTE_RESPONSIBILITY),
  reason: z.string(),
  evidenceAssessment: z.string(),
  itemPrice: vndAmountSchema,
  refundPlan: disputeRefundPlanSchema.nullish(),
  remedyKey: z.string(),
  decidedAt: dateTimeSchema,
  notifiedAt: dateTimeSchema,
  appealUntil: dateTimeSchema.nullable(),
  calendarMissing: z.boolean(),
  reviewLate: z.boolean().nullable(),
});
