import type { ResolvedShippingPackage } from '@/common/schemas/shipping-package.schema';

export type CheckoutState = 'HELD' | 'EMPTY' | 'CANCELLED' | 'EXPIRED';

export type CheckoutAddress = {
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  countryCode: string;
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  postalCode: string | null;
  deliveryInstructions: string | null;
};
export type CheckoutItem = {
  shippingPackage: ResolvedShippingPackage | null;
  productId: string;
  title: string;
  price: number;
  revision: number;
  size: string | null;
  condition: string;
  coverUrl: string | null;
};
export type RemovedCheckoutItem = { productId: string; reason: string };
