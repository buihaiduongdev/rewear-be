import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';

export const createPaymentSchema = z.strictObject({ requestId: z.uuid() });
export const paymentViewSchema = z.object({
  id: z.uuid(),
  checkoutId: z.uuid(),
  amount: z.number().int(),
  state: z.enum([
    'CREATING',
    'PENDING',
    'UNKNOWN',
    'FAILED',
    'PAID',
    'REFUND_REQUIRED',
    'REFUNDED',
  ]),
  payUrl: z.url().nullable(),
  paidAt: dateTimeSchema.nullable(),
  refunds: z.array(
    z.object({
      id: z.uuid(),
      amount: z.number().int(),
      state: z.enum(['QUEUED', 'UNKNOWN', 'COMPLETED', 'REVIEW_REQUIRED']),
    }),
  ),
});
export const momoIpnSchema = z.object({
  partnerCode: z.string().max(50),
  orderId: z.string().max(200),
  requestId: z.string().max(50),
  amount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  transId: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  resultCode: z.number().int().nonnegative(),
  responseTime: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  message: z.string().max(1000),
  orderInfo: z.string().max(255),
  orderType: z.string().max(50),
  payType: z.string().max(50),
  extraData: z.string().max(1000),
  signature: z.string().regex(/^[a-f0-9]{64}$/i),
});
