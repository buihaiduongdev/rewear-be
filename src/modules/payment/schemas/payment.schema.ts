import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { safeBalanceSchema } from '@/common/schemas/money.schema';

import {
  PAYMENT_ATTEMPT_STATE,
  PAYMENT_REFUND_STATE,
} from '../constants/payment.constant';

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
export const momoIpnSchema = z.object({
  partnerCode: z.string().max(50),
  orderId: z.string().max(200),
  requestId: z.string().max(50),
  amount: safeBalanceSchema,
  transId: safeBalanceSchema,
  resultCode: z.number().int().nonnegative(),
  responseTime: safeBalanceSchema,
  message: z.string().max(1000),
  orderInfo: z.string().max(255),
  orderType: z.string().max(50),
  payType: z.string().max(50),
  extraData: z.string().max(1000),
  signature: z.string().regex(/^[a-f0-9]{64}$/i),
});
