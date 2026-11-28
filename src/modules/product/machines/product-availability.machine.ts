import { CartAvailability } from '@/modules/cart/enums/cart-availability.enum';
import { shopAllowsIdentitySales } from '@/modules/shop/applications/constants/shop-application.constant';
import { ShopStatus } from '@/modules/shop/enums';

import type { Product } from '../entities';
import { ProductStatus } from '../enums';

export interface EvaluateProductAvailabilityOptions {
  requireCompleteMetadata?: boolean;
  requirePurchaseEligibility?: boolean;
}

export function evaluateProductAvailability(
  product?: Product | null,
  options: EvaluateProductAvailabilityOptions = {},
): CartAvailability {
  if (!product) return CartAvailability.UNAVAILABLE;

  const isPublicStatus =
    product.status === ProductStatus.ACTIVE ||
    product.status === ProductStatus.HELD ||
    product.status === ProductStatus.SOLD;
  if (!isPublicStatus) return CartAvailability.UNAVAILABLE;

  const shopStatus = product.shop?.status;
  if (
    options.requireCompleteMetadata
      ? shopStatus !== ShopStatus.ACTIVE
      : !!shopStatus && shopStatus !== ShopStatus.ACTIVE
  ) {
    return CartAvailability.UNAVAILABLE;
  }

  if (
    options.requirePurchaseEligibility &&
    product.shop &&
    !shopAllowsIdentitySales(product.shop)
  ) {
    return CartAvailability.UNAVAILABLE;
  }

  const category = product.category;
  if (
    options.requireCompleteMetadata
      ? category?.isActive !== true
      : !!category && category.isActive === false
  ) {
    return CartAvailability.UNAVAILABLE;
  }

  if (
    options.requireCompleteMetadata &&
    (!product.title ||
      product.price === null ||
      product.price === undefined ||
      product.price <= 0 ||
      product.condition === null ||
      product.condition === undefined)
  ) {
    return CartAvailability.UNAVAILABLE;
  }

  if (product.status === ProductStatus.HELD) return CartAvailability.HELD;
  if (product.status === ProductStatus.SOLD) return CartAvailability.SOLD;
  return CartAvailability.AVAILABLE;
}

export function isProductDisplayable(
  product?: Product | null,
  options: { requireCompleteMetadata?: boolean } = {},
): boolean {
  return (
    evaluateProductAvailability(product, options) !==
    CartAvailability.UNAVAILABLE
  );
}
