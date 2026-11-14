import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { trimmedTextSchema } from '@/common/schemas/request.schema';

import { orderStates } from './order.type';

export const orderListInputSchema = z.strictObject({
  status: z.enum(orderStates).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});
export const rejectOrderSchema = z.strictObject({
  reason: trimmedTextSchema.min(1).max(1000),
});
export const acceptOrderSchema = z.strictObject({});
export const orderSchema = z.object({
  id: z.uuid(),
  paymentId: z.uuid(),
  shopId: z.uuid(),
  shopName: z.string(),
  status: z.enum(orderStates),
  subtotal: z.number().int(),
  shippingFee: z.number().int(),
  total: z.number().int(),
  sellerConfirmBy: dateTimeSchema,
  acceptedAt: dateTimeSchema.nullable(),
  cancelledAt: dateTimeSchema.nullable(),
  cancellationReason: z
    .enum(['SELLER_REJECTED', 'SELLER_CONFIRM_TIMEOUT'])
    .nullable(),
  cancellationNote: z.string().nullable(),
  address: z.record(z.string(), z.unknown()),
  items: z.array(z.record(z.string(), z.unknown())),
  stockReleaseReviewIds: z.array(z.uuid()),
  walletRefund: z
    .object({
      id: z.uuid(),
      amount: z.number().int().positive(),
      creditedAt: dateTimeSchema,
    })
    .nullable()
    .optional(),
  events: z
    .array(
      z.object({
        id: z.uuid(),
        action: z.enum(['PAID', 'ACCEPTED', 'REJECTED', 'EXPIRED']),
        actorId: z.uuid().nullable(),
        reason: z.string().nullable(),
        createdAt: dateTimeSchema,
      }),
    )
    .optional(),
});
export const orderListSchema = z.array(orderSchema);
