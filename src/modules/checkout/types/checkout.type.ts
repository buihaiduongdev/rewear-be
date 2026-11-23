import type z from 'zod';

import type { ResolvedShippingPackage } from '@/common/schemas/shipping-package.schema';

import type { CHECKOUT_STATUS } from '../constants/checkout.constant';
import type { createCheckoutSchema } from '../schemas/checkout.schema';

export type CheckoutState =
  (typeof CHECKOUT_STATUS)[keyof typeof CHECKOUT_STATUS];

export type CheckoutAddress = {
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  countryCode: string;
  provinceId: number;
  provinceName: string;
  districtId: number;
  districtName: string;
  wardCode: string;
  wardName: string;
  postalCode: string | null;
  deliveryInstructions: string | null;
};
export type CheckoutItem = {
  coinDiscount?: number;
  shippingPackage: ResolvedShippingPackage | null;
  productId: string;
  title: string;
  price: number;
  size: string | null;
  condition: string;
  coverUrl: string | null;
};
export type RemovedCheckoutItem = { productId: string; reason: string };

export type CreateCheckoutInput = z.output<typeof createCheckoutSchema>;
