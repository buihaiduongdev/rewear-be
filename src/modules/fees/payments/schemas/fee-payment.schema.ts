import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import {
  PAYMENT_MAX_AMOUNT,
  PAYMENT_MIN_AMOUNT,
} from '@/modules/payment/constants/payment.constant';

import { FEE_PAYMENT_POLICY } from '../constants/fee-payment.constant';
import {
  FEE_PAYMENT_STATE,
  FEE_PROVIDER_REFUND_STATE,
} from '../constants/fee-payment.constant';

export const createFeePaymentSchema = z.object({
  requestId: z.uuid(),
  feeIds: z.array(z.uuid()).min(1).max(FEE_PAYMENT_POLICY.TARGET_LIMIT),
  amount: z.number().int().min(PAYMENT_MIN_AMOUNT).max(PAYMENT_MAX_AMOUNT),
  mode: z.literal(RECONCILIATION_MODE.SIMULATION),
});
export type CreateFeePaymentInput = z.infer<typeof createFeePaymentSchema>;
export const refundResponseSchema = z.object({
  message: z.string().trim().min(1).max(FEE_PAYMENT_POLICY.ADMIN_MESSAGE_LIMIT),
});

export const feeRefundPublicSchema = z.object({
  id: z.uuid(),
  amount: z.number().int().positive(),
  state: z.enum(FEE_PROVIDER_REFUND_STATE),
  alertedAt: dateTimeSchema.nullable(),
  responseDueAt: dateTimeSchema.nullable(),
});
export const feePaymentViewSchema = z.object({
  id: z.uuid(),
  amount: z.number().int().positive(),
  mode: z.literal(RECONCILIATION_MODE.SIMULATION),
  state: z.enum(FEE_PAYMENT_STATE),
  payUrl: z.url().nullable(),
  targets: z.array(
    z.object({ feeId: z.uuid(), amount: z.number().int().positive() }),
  ),
  paidAt: dateTimeSchema.nullable(),
  refunds: z.array(feeRefundPublicSchema),
});
export const feeRefundOperationsSchema = feeRefundPublicSchema.extend({
  paymentId: z.uuid(),
  captureId: z.uuid(),
  feeRefundId: z.uuid().nullable(),
  collectionId: z.uuid().nullable(),
  feeId: z.uuid().nullable(),
  providerTransId: z.string(),
  requestId: z.uuid(),
  history: z.array(z.object({ at: dateTimeSchema, state: z.string() })),
});
export const feeRefundOperationsListSchema = z.array(feeRefundOperationsSchema);
export const feeRefundResponseViewSchema = feeRefundPublicSchema.extend({
  captureId: z.uuid(),
  history: z.array(z.object({ at: dateTimeSchema, state: z.string() })),
});
