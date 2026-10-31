import z from 'zod';

import { resolvedShippingPackageSchema } from '@/common/schemas/shipping-package.schema';

export const quoteReasonSchema = z.enum([
  'PACKAGE_REQUIRED',
  'PARCEL_LIMIT_EXCEEDED',
  'PICKUP_REQUIRED',
  'DECLARED_VALUE_LIMIT',
  'ADDRESS_MAPPING_UNAVAILABLE',
  'CARRIER_NOT_CONFIGURED',
  'CARRIER_REJECTED',
  'CARRIER_UNAVAILABLE',
]);
export const quoteOrderSchema = z.object({
  orderId: z.uuid(),
  sourceType: z.enum(['USER', 'SHOP']),
  sourceId: z.uuid(),
  parcel: resolvedShippingPackageSchema.nullable(),
  parcelCount: z.literal(1),
  itemCount: z.number().int().positive(),
  status: z.enum(['QUOTED', 'UNAVAILABLE']),
  reason: quoteReasonSchema.nullable(),
  fee: z.number().int().nonnegative().nullable(),
  estimatedDeliveryAt: z.string().nullable(),
});
export const shippingQuoteSchema = z.object({
  id: z.uuid(),
  status: z.enum([
    'FETCHING',
    'READY',
    'PARTIAL',
    'UNAVAILABLE',
    'EXPIRED',
    'INVALIDATED',
  ]),
  environment: z.literal('SANDBOX'),
  carrier: z.literal('GHN'),
  parcelMethod: z.literal('BOUNDING_STACK_V1'),
  quotedAt: z.string(),
  expiresAt: z.string(),
  orders: z.array(quoteOrderSchema),
  totalShippingFee: z.number().int().nonnegative().nullable(),
  grandTotal: z.number().int().nonnegative().nullable(),
  currency: z.literal('VND'),
  paymentReady: z.literal(false),
});
export type ShippingQuoteResult = z.output<typeof shippingQuoteSchema>;
export type QuoteOrder = z.output<typeof quoteOrderSchema>;
export const refreshShippingQuoteSchema = z.strictObject({});
