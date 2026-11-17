import type z from 'zod';

import type {
  DISPUTE_DECISION_OUTCOME,
  DISPUTE_RESPONSIBILITY,
} from '../constants/dispute.constant';
import type { disputeDecisionInputSchema } from '../schemas/dispute-decision.schema';

export type DisputeDecisionOutcome =
  (typeof DISPUTE_DECISION_OUTCOME)[keyof typeof DISPUTE_DECISION_OUTCOME];
export type DisputeResponsibility =
  (typeof DISPUTE_RESPONSIBILITY)[keyof typeof DISPUTE_RESPONSIBILITY];
export type DisputeDecisionInput = z.output<typeof disputeDecisionInputSchema>;
export interface DisputeDecisionBasis {
  orderId: string;
  shopId: string;
  buyerId: string;
  productId: string;
  itemPrice: number;
  commissionBasisPoints: number;
  evidenceIds: string[];
  messageIds: string[];
  sellerRespondBy: string;
  reviewDueAt: string | null;
}
