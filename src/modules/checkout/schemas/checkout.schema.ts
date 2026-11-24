import z from 'zod';

import { MONEY_CURRENCY } from '@/common/constants/money.constant';
import { dateTimeSchema } from '@/common/schemas';
import { resolvedShippingPackageSchema } from '@/common/schemas/shipping-package.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { feeDisclosureSchema } from '@/modules/fees/disclosure/fee-disclosure.schema';

import {
  CHECKOUT_MAX_ITEMS,
  CHECKOUT_STATUS,
} from '../constants/checkout.constant';

export const createCheckoutSchema = z
  .strictObject({
    feePolicyId: z.uuid().optional(),
    feeTermsAccepted: z.literal(true).optional(),
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
  })
  .refine(
    (input) => Boolean(input.feePolicyId) === Boolean(input.feeTermsAccepted),
    'Fee policy and explicit acceptance must be supplied together',
  );

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
export const checkoutSchema = z.object({
  identityReviewRequired: z.boolean().default(false),
  coinDiscount: z.number().int().nonnegative().default(0),
  coinMode: z.enum(RECONCILIATION_MODE).nullable().default(null),
  feeDisclosure: feeDisclosureSchema.nullable().default(null),
  id: z.uuid(),
  status: z.enum(CHECKOUT_STATUS),
  expiresAt: dateTimeSchema.nullable(),
  holdSeconds: z.number().int(),
  removedItems: z.array(z.object({ productId: z.uuid(), reason: z.string() })),
  address: addressSchema,
  orders: z.array(
    z.object({
      coinDiscount: z.number().int().nonnegative().default(0),
      id: z.uuid(),
      shopId: z.uuid(),
      shopName: z.string(),
      address: addressSchema,
      items: z.array(
        z.object({
          shippingPackage: resolvedShippingPackageSchema
            .nullable()
            .default(null),
          coinDiscount: z.number().int().nonnegative().default(0),
          productId: z.uuid(),
          title: z.string(),
          price: z.number().int(),
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
  currency: z.literal(MONEY_CURRENCY.VND),
  paymentReady: z.literal(false),
});

export type { CreateCheckoutInput } from '../types/checkout.type';

export const selectCheckoutCoinsSchema = z.strictObject({
  requestId: z.uuid(),
  amount: z.number().int().nonnegative(),
  mode: z.enum(RECONCILIATION_MODE),
});
export type SelectCheckoutCoinsInput = z.output<
  typeof selectCheckoutCoinsSchema
>;

export const confirmIdentityCheckoutSchema = z.strictObject({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  confirmed: z.literal(true),
});
