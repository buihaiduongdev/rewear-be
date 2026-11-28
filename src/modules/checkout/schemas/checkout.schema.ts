import z from 'zod';

import { MONEY_CURRENCY } from '@/common/constants/money.constant';
import { dateTimeSchema } from '@/common/schemas';
import { resolvedShippingPackageSchema } from '@/common/schemas/shipping-package.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';

import {
  CHECKOUT_MAX_ITEMS,
  CHECKOUT_STATUS,
} from '../constants/checkout.constant';

export type CheckoutState =
  (typeof CHECKOUT_STATUS)[keyof typeof CHECKOUT_STATUS];

export const createCheckoutSchema = z.strictObject({
  requestId: z.uuid(),
  addressId: z.uuid(),
  productIds: z
    .array(z.uuid())
    .min(1)
    .max(CHECKOUT_MAX_ITEMS)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      'Duplicate products are not allowed',
    ),
});
export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;

const addressSchema = z.object({
  recipientName: z.string(),
  phone: z.string(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  countryCode: z.string(),
  provinceId: z.number().int().positive(),
  provinceName: z.string(),
  districtId: z.number().int().positive(),
  districtName: z.string(),
  wardCode: z.string(),
  wardName: z.string(),
  postalCode: z.string().nullable(),
  deliveryInstructions: z.string().nullable(),
});
export type CheckoutAddress = z.infer<typeof addressSchema>;

const removedCheckoutItemSchema = z.object({
  productId: z.uuid(),
  reason: z.string(),
});
export type RemovedCheckoutItem = z.infer<typeof removedCheckoutItemSchema>;

const checkoutItemSchema = z.object({
  shippingPackage: resolvedShippingPackageSchema.nullable().default(null),
  coinDiscount: z.number().int().nonnegative().default(0),
  productId: z.uuid(),
  title: z.string(),
  price: z.number().int(),
  size: z.string().nullable(),
  condition: z.string(),
  coverUrl: z.string().nullable(),
});
export type CheckoutItem = Omit<
  z.infer<typeof checkoutItemSchema>,
  'coinDiscount'
> & {
  coinDiscount?: number;
};

export const checkoutSchema = z.object({
  identityReviewRequired: z.boolean().default(false),
  coinDiscount: z.number().int().nonnegative().default(0),
  coinMode: z.enum(RECONCILIATION_MODE).nullable().default(null),
  id: z.uuid(),
  status: z.enum(CHECKOUT_STATUS),
  expiresAt: dateTimeSchema.nullable(),
  holdSeconds: z.number().int(),
  removedItems: z.array(removedCheckoutItemSchema),
  address: addressSchema,
  orders: z.array(
    z.object({
      coinDiscount: z.number().int().nonnegative().default(0),
      id: z.uuid(),
      shopId: z.uuid(),
      shopName: z.string(),
      address: addressSchema,
      items: z.array(checkoutItemSchema),
      subtotal: z.number().int(),
      shippingFee: z.number().int().nullable(),
    }),
  ),
  subtotal: z.number().int(),
  currency: z.literal(MONEY_CURRENCY.VND),
  paymentReady: z.literal(false),
});

export const selectCheckoutCoinsSchema = z.strictObject({
  requestId: z.uuid(),
  amount: z.number().int().nonnegative(),
  mode: z.enum(RECONCILIATION_MODE),
});
export type SelectCheckoutCoinsInput = z.infer<
  typeof selectCheckoutCoinsSchema
>;
