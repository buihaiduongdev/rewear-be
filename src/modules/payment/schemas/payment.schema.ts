import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { safeBalanceSchema } from '@/common/schemas/money.schema';
import type {
  CheckoutAddress,
  CheckoutItem,
} from '@/modules/checkout/schemas/checkout.schema';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import {
  PAYMENT_ATTEMPT_STATE,
  PAYMENT_CAPTURE_DISPOSITION,
  PAYMENT_PROVIDER,
  PAYMENT_PROVIDER_OUTCOME,
  PAYMENT_REFUND_REASON,
  PAYMENT_REFUND_RESOLUTION,
  PAYMENT_REFUND_STATE,
} from '../constants/payment.constant';

export type PaymentProvider =
  (typeof PAYMENT_PROVIDER)[keyof typeof PAYMENT_PROVIDER];
export type AttemptState =
  (typeof PAYMENT_ATTEMPT_STATE)[keyof typeof PAYMENT_ATTEMPT_STATE];
export type RefundState =
  (typeof PAYMENT_REFUND_STATE)[keyof typeof PAYMENT_REFUND_STATE];
export type RefundReason =
  (typeof PAYMENT_REFUND_REASON)[keyof typeof PAYMENT_REFUND_REASON];
export type RefundResolutionMethod =
  (typeof PAYMENT_REFUND_RESOLUTION)[keyof typeof PAYMENT_REFUND_RESOLUTION];
export type ProviderOutcome =
  (typeof PAYMENT_PROVIDER_OUTCOME)[keyof typeof PAYMENT_PROVIDER_OUTCOME];
export type CaptureDisposition =
  (typeof PAYMENT_CAPTURE_DISPOSITION)[keyof typeof PAYMENT_CAPTURE_DISPOSITION];

export interface PaymentOrderSnapshot {
  coinDiscount?: number;
  coinMode?: ReconciliationMode | null;
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
  provider: z.enum(PAYMENT_PROVIDER).default(PAYMENT_PROVIDER.PAYOS),
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

export const momoIpnSchema = z.object({
  partnerCode: z.string().min(1),
  orderId: z.string().min(1),
  requestId: z.string().min(1),
  amount: safeBalanceSchema,
  orderInfo: z.string(),
  orderType: z.string(),
  transId: z.union([z.number().int().nonnegative(), z.string()]),
  resultCode: z.number().int(),
  message: z.string(),
  payType: z.string(),
  responseTime: z.union([z.number().int().nonnegative(), z.string()]),
  extraData: z.string().default(''),
  signature: z.string().min(1),
});

export const resolvePaymentRefundSchema = z
  .strictObject({
    action: z.enum(['CREDIT_WALLET', 'MANUAL_TRANSFER']),
    note: z.string().trim().min(1).max(1000).optional(),
    bankReference: z.string().trim().min(1).max(200).optional(),
  })
  .refine(
    (input) =>
      input.action !== 'MANUAL_TRANSFER' ||
      Boolean(input.note || input.bankReference),
    {
      path: ['note'],
      message: 'Manual transfer resolution requires a note or bank reference',
    },
  );

export const adminPaymentRefundQuerySchema = z.strictObject({
  state: z.enum(PAYMENT_REFUND_STATE).optional(),
});

export const adminPaymentRefundItemSchema = z.object({
  id: z.uuid(),
  paymentId: z.uuid(),
  checkoutId: z.uuid().nullable().default(null),
  buyerId: z.uuid().nullable().default(null),
  provider: z.enum(PAYMENT_PROVIDER).default(PAYMENT_PROVIDER.PAYOS),
  providerTransId: z.string(),
  amount: z.number().int(),
  reason: z.enum(PAYMENT_REFUND_REASON),
  state: z.enum(PAYMENT_REFUND_STATE),
  resolutionMethod: z.enum(PAYMENT_REFUND_RESOLUTION).nullable().default(null),
  resolutionNote: z.string().nullable().default(null),
  resolvedById: z.uuid().nullable().default(null),
  resolvedAt: dateTimeSchema.nullable().default(null),
  alertedAt: dateTimeSchema.nullable().default(null),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const adminPaymentRefundListSchema = z.object({
  refunds: z.array(adminPaymentRefundItemSchema),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type PayosWebhookBody = z.infer<typeof payosWebhookSchema>;
export type MomoIpnBody = z.infer<typeof momoIpnSchema>;
export type ResolvePaymentRefundInput = z.infer<
  typeof resolvePaymentRefundSchema
>;
export type AdminPaymentRefundQuery = z.infer<
  typeof adminPaymentRefundQuerySchema
>;
