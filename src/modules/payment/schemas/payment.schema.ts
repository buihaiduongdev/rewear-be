import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { safeBalanceSchema } from '@/common/schemas/money.schema';
import type {
  CheckoutAddress,
  CheckoutItem,
} from '@/modules/checkout/schemas/checkout.schema';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import type { FeeDisclosure } from '@/modules/fees/disclosure/fee-disclosure.schema';

import {
  PAYMENT_ATTEMPT_STATE,
  PAYMENT_CAPTURE_DISPOSITION,
  PAYMENT_PROVIDER_OUTCOME,
  PAYMENT_REFUND_REASON,
  PAYMENT_REFUND_STATE,
} from '../constants/payment.constant';

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
  coinDiscount?: number;
  coinMode?: ReconciliationMode | null;
  feeDisclosure?: FeeDisclosure | null;
  checkoutOrderId: string;
  shopId: string;
  shopName: string;
  subtotal: number;
  shippingFee: number;
  address: CheckoutAddress;
  items: CheckoutItem[];
}

export const createPaymentSchema = z.strictObject({ requestId: z.uuid() });

export const paymentViewSchema = z.object({
  id: z.uuid(),
  checkoutId: z.uuid(),
  amount: z.number().int(),
  state: z.enum(PAYMENT_ATTEMPT_STATE),
  payUrl: z.url().nullable(),
  paidAt: dateTimeSchema.nullable(),
  refunds: z.array(
    z.object({
      id: z.uuid(),
      amount: z.number().int(),
      state: z.enum(PAYMENT_REFUND_STATE),
    }),
  ),
});

export const payosWebhookSchema = z.object({
  code: z.string(),
  desc: z.string(),
  success: z.boolean().optional(),
  data: z
    .object({
      orderCode: safeBalanceSchema,
      amount: safeBalanceSchema,
      description: z.string(),
      reference: z.string(),
    })
    .passthrough(),
  signature: z.string().min(1),
});

export type CreatePaymentInput = z.output<typeof createPaymentSchema>;
export type PayosWebhookBody = z.output<typeof payosWebhookSchema>;
