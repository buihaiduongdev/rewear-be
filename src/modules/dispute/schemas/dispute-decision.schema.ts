import z from 'zod';

import { vndAmountSchema } from '@/common/schemas/money.schema';
import { trimmedTextSchema } from '@/common/schemas/request.schema';

import {
  DISPUTE_DECISION_OUTCOME,
  DISPUTE_RESPONSIBILITY,
} from '../constants/dispute.constant';
import { disputeDecisionViewSchema } from './dispute-decision-view.schema';
import {
  disputeEvidenceViewSchema,
  disputeIssueViewSchema,
  disputeMessageViewSchema,
} from './dispute-view.schema';

export { disputeDecisionViewSchema } from './dispute-decision-view.schema';

export const disputeDecisionInputSchema = z.strictObject({
  requestId: z.uuid(),
  reviewToken: z.string().regex(/^[a-f0-9]{64}$/),
  outcome: z.enum(DISPUTE_DECISION_OUTCOME),
  responsibility: z.enum(DISPUTE_RESPONSIBILITY),
  reason: trimmedTextSchema.min(1).max(2000),
  evidenceAssessment: trimmedTextSchema.min(1).max(4000),
});
export const disputeAdminReviewSchema = z.object({
  reviewToken: z.string(),
  issue: disputeIssueViewSchema,
  evidence: z.array(disputeEvidenceViewSchema),
  messages: z.array(disputeMessageViewSchema),
  messageCount: z.number().int().nonnegative(),
  messageOffset: z.number().int().nonnegative(),
  order: z.object({
    orderId: z.uuid(),
    shopId: z.uuid(),
    buyerId: z.uuid(),
    productId: z.uuid(),
    itemPrice: vndAmountSchema,
    commissionBasisPoints: z.number().int(),
  }),
  decision: disputeDecisionViewSchema.nullable(),
});
