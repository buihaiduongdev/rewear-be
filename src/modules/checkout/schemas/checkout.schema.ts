import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';

export const createCheckoutSchema = z.strictObject({
  requestId: z.uuid(),
  addressId: z.uuid(),
  productIds: z
    .array(z.uuid())
    .min(1)
    .max(50)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      'Duplicate products are not allowed',
    ),
});
export type CreateCheckoutInput = z.output<typeof createCheckoutSchema>;
const addressSchema = z.object({
  recipientName: z.string(),
  phone: z.string(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  countryCode: z.string(),
  provinceCode: z.string(),
  provinceName: z.string(),
  wardCode: z.string(),
  wardName: z.string(),
  postalCode: z.string().nullable(),
  deliveryInstructions: z.string().nullable(),
});
export const checkoutSchema = z.object({
  id: z.uuid(),
  status: z.enum(['HELD', 'EMPTY', 'CANCELLED', 'EXPIRED']),
  expiresAt: dateTimeSchema.nullable(),
  holdSeconds: z.number().int(),
  removedItems: z.array(z.object({ productId: z.uuid(), reason: z.string() })),
  address: addressSchema,
  orders: z.array(
    z.object({
      id: z.uuid(),
      sourceType: z.enum(['USER', 'SHOP']),
      sourceId: z.uuid(),
      sourceName: z.string(),
      address: addressSchema,
      items: z.array(
        z.object({
          productId: z.uuid(),
          title: z.string(),
          price: z.number().int(),
          revision: z.number().int(),
          size: z.string().nullable(),
          condition: z.string(),
          coverUrl: z.string().nullable(),
        }),
      ),
      subtotal: z.number().int(),
      shippingFee: z.number().int().nullable(),
    }),
  ),
  subtotal: z.number().int(),
  currency: z.literal('VND'),
  paymentReady: z.literal(false),
});
