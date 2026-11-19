import type { DISPUTE_REFUND_CONDITION } from '../constants/refund.constant';

export type DisputeRefundCondition =
  (typeof DISPUTE_REFUND_CONDITION)[keyof typeof DISPUTE_REFUND_CONDITION];
export interface DisputeRefundPlan {
  amount: number;
  condition: DisputeRefundCondition;
}
