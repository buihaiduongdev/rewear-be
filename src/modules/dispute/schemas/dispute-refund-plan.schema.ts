import z from 'zod';

import { DISPUTE_REFUND_CONDITION } from '../constants/refund.constant';

export const disputeRefundPlanSchema = z.strictObject({
  amount: z.number().int().positive().safe(),
  condition: z.enum(DISPUTE_REFUND_CONDITION),
});

export type DisputeRefundCondition =
  (typeof DISPUTE_REFUND_CONDITION)[keyof typeof DISPUTE_REFUND_CONDITION];
export interface DisputeRefundPlan {
  amount: number;
  condition: DisputeRefundCondition;
}
