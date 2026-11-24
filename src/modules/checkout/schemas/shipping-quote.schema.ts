import z from 'zod';

import { MONEY_CURRENCY } from '@/common/constants/money.constant';
import { resolvedShippingPackageSchema } from '@/common/schemas/shipping-package.schema';

import {
  SHIPPING_QUOTE_CARRIER,
  SHIPPING_QUOTE_ENVIRONMENT,
  SHIPPING_QUOTE_ORDER_STATUS,
  SHIPPING_QUOTE_PARCEL_METHOD,
  SHIPPING_QUOTE_REASON,
  SHIPPING_QUOTE_STATUS,
} from '../constants/shipping-quote.constant';

export const quoteReasonSchema = z.enum(SHIPPING_QUOTE_REASON);
export const quoteOrderSchema = z.object({
  orderId: z.uuid(),
  shopId: z.uuid(),
  parcel: resolvedShippingPackageSchema.nullable(),
  parcelCount: z.literal(1),
  itemCount: z.number().int().positive(),
  status: z.enum(SHIPPING_QUOTE_ORDER_STATUS),
  reason: quoteReasonSchema.nullable(),
  fee: z.number().int().nonnegative().nullable(),
  estimatedDeliveryAt: z.string().nullable(),
});
export const shippingQuoteSchema = z.object({
  identityReviewRequired: z.boolean().optional(),
  identityQuoteFingerprint: z.string().nullable().optional(),
  status: z.enum(SHIPPING_QUOTE_STATUS),
  environment: z.literal(SHIPPING_QUOTE_ENVIRONMENT.SANDBOX),
  carrier: z.literal(SHIPPING_QUOTE_CARRIER.GHN),
  parcelMethod: z.literal(SHIPPING_QUOTE_PARCEL_METHOD.BOUNDING_STACK_V1),
  quotedAt: z.string(),
  orders: z.array(quoteOrderSchema),
  totalShippingFee: z.number().int().nonnegative().nullable(),
  grandTotal: z.number().int().nonnegative().nullable(),
  currency: z.literal(MONEY_CURRENCY.VND),
  paymentReady: z.literal(false),
});

export const refreshShippingQuoteSchema = z.strictObject({});

export type {
  ShippingQuoteResult,
  QuoteOrder,
} from '../types/shipping-quote.type';
