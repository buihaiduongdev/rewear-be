import type {
  REFUND_BLOCK,
  REFUND_STATE,
} from '../constants/refund-execution.constant';

export type RefundState = (typeof REFUND_STATE)[keyof typeof REFUND_STATE];
export type RefundBlock = (typeof REFUND_BLOCK)[keyof typeof REFUND_BLOCK];
