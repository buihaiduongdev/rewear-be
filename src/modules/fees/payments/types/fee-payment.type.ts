import {
  FEE_PAYMENT_STATE,
  FEE_PROVIDER_REFUND_STATE,
} from '../constants/fee-payment.constant';

export type FeePaymentState =
  (typeof FEE_PAYMENT_STATE)[keyof typeof FEE_PAYMENT_STATE];
export type ProviderRefundState =
  (typeof FEE_PROVIDER_REFUND_STATE)[keyof typeof FEE_PROVIDER_REFUND_STATE];
export interface FeeTarget {
  feeId: string;
  amount: number;
  mode: 'SIMULATION';
  party: 'BUYER' | 'SHOP';
  buyerId: string;
  shopId: string;
  orderId: string;
  payableAmount: number;
}
