import type {
  EXCESS_METHOD,
  EXCESS_PAYMENT_STATE,
  EXCESS_REVIEW,
  EXCESS_SOURCE,
} from '../constants/excess.constant';

export type ExcessSource = (typeof EXCESS_SOURCE)[keyof typeof EXCESS_SOURCE];
export type ExcessReview = (typeof EXCESS_REVIEW)[keyof typeof EXCESS_REVIEW];
export type ExcessMethod = (typeof EXCESS_METHOD)[keyof typeof EXCESS_METHOD];
export type ExcessPaymentState =
  (typeof EXCESS_PAYMENT_STATE)[keyof typeof EXCESS_PAYMENT_STATE];
export type ExcessPaymentTarget = { excessId: string; amount: number };
