import type {
  CheckoutAddress,
  CheckoutItem,
} from '@/modules/checkout/types/checkout.type';

import type {
  PAYMENT_ATTEMPT_STATE,
  PAYMENT_CAPTURE_DISPOSITION,
  PAYMENT_PROVIDER_OUTCOME,
  PAYMENT_REFUND_REASON,
  PAYMENT_REFUND_STATE,
} from './payment.constants';

export type AttemptState =
  (typeof PAYMENT_ATTEMPT_STATE)[keyof typeof PAYMENT_ATTEMPT_STATE];
export type RefundState =
  (typeof PAYMENT_REFUND_STATE)[keyof typeof PAYMENT_REFUND_STATE];
export type RefundReason =
  (typeof PAYMENT_REFUND_REASON)[keyof typeof PAYMENT_REFUND_REASON];
export type ProviderOutcome =
  (typeof PAYMENT_PROVIDER_OUTCOME)[keyof typeof PAYMENT_PROVIDER_OUTCOME];
export type CaptureDisposition =
  (typeof PAYMENT_CAPTURE_DISPOSITION)[keyof typeof PAYMENT_CAPTURE_DISPOSITION];

export interface PaymentOrderSnapshot {
  checkoutOrderId: string;
  shopId: string;
  shopName: string;
  subtotal: number;
  shippingFee: number;
  address: CheckoutAddress;
  items: CheckoutItem[];
}
