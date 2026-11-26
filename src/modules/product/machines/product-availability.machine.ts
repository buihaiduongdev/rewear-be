import { createActor, setup } from 'xstate';

import { CartAvailability } from '@/modules/cart/enums/cart-availability.enum';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { shopAllowsIdentitySales } from '@/modules/shop/applications/constants/shop-application.constant';
import { ShopStatus } from '@/modules/shop/enums';

export interface ProductAvailabilityContext {
  product?: Product | null;
  requireCompleteMetadata?: boolean;
  requirePurchaseEligibility?: boolean;
}

export type ProductAvailabilityState =
  'evaluating' | 'available' | 'held' | 'sold' | 'unavailable';

export const productAvailabilityMachine = setup({
  types: {
    input: {} as ProductAvailabilityContext,
    context: {} as ProductAvailabilityContext,
  },
  guards: {
    isIdentityRestricted: ({ context }) =>
      !!context.requirePurchaseEligibility &&
      !!context.product?.shop &&
      !shopAllowsIdentitySales(context.product.shop),
    isMissingProduct: ({ context }) => !context.product,

    isNonPublicLifecycleStatus: ({ context }) => {
      const s = context.product?.status;
      return (
        s !== ProductStatus.ACTIVE &&
        s !== ProductStatus.HELD &&
        s !== ProductStatus.SOLD
      );
    },

    isShopInactive: ({ context }) => {
      const status = context.product?.shop?.status;
      if (context.requireCompleteMetadata) {
        return status !== ShopStatus.ACTIVE;
      }
      return !!status && status !== ShopStatus.ACTIVE;
    },

    isCategoryInactive: ({ context }) => {
      const category = context.product?.category;
      if (context.requireCompleteMetadata) {
        return category?.isActive !== true;
      }
      return !!category && category.isActive === false;
    },

    isIncompleteCommercialMetadata: ({ context }) => {
      if (!context.requireCompleteMetadata) {
        return false;
      }
      const p = context.product;
      if (!p) {
        return true;
      }
      return (
        !p.title ||
        p.price === null ||
        p.price === undefined ||
        p.price <= 0 ||
        p.condition === null ||
        p.condition === undefined
      );
    },

    isHeld: ({ context }) => context.product?.status === ProductStatus.HELD,
    isSold: ({ context }) => context.product?.status === ProductStatus.SOLD,
    isActive: ({ context }) => context.product?.status === ProductStatus.ACTIVE,
  },
}).createMachine({
  id: 'productAvailability',
  context: ({ input }) => input,
  initial: 'evaluating',
  states: {
    evaluating: {
      always: [
        { target: 'unavailable', guard: 'isMissingProduct' },
        { target: 'unavailable', guard: 'isNonPublicLifecycleStatus' },
        { target: 'unavailable', guard: 'isShopInactive' },
        { target: 'unavailable', guard: 'isIdentityRestricted' },
        { target: 'unavailable', guard: 'isCategoryInactive' },
        { target: 'unavailable', guard: 'isIncompleteCommercialMetadata' },
        { target: 'held', guard: 'isHeld' },
        { target: 'sold', guard: 'isSold' },
        { target: 'available', guard: 'isActive' },
        { target: 'unavailable' },
      ],
    },
    available: { type: 'final' },
    held: { type: 'final' },
    sold: { type: 'final' },
    unavailable: { type: 'final' },
  },
});

const STATE_TO_AVAILABILITY_MAP: Record<
  ProductAvailabilityState,
  CartAvailability
> = {
  evaluating: CartAvailability.UNAVAILABLE,
  available: CartAvailability.AVAILABLE,
  held: CartAvailability.HELD,
  sold: CartAvailability.SOLD,
  unavailable: CartAvailability.UNAVAILABLE,
};

export interface EvaluateProductAvailabilityOptions {
  requireCompleteMetadata?: boolean;
  requirePurchaseEligibility?: boolean;
}

export function evaluateProductAvailability(
  product?: Product | null,
  options: EvaluateProductAvailabilityOptions = {},
): CartAvailability {
  const actor = createActor(productAvailabilityMachine, {
    input: {
      product,
      requirePurchaseEligibility: options.requirePurchaseEligibility,
      requireCompleteMetadata: options.requireCompleteMetadata,
    },
  });
  actor.start();
  const state = actor.getSnapshot().value as ProductAvailabilityState;
  actor.stop();

  return STATE_TO_AVAILABILITY_MAP[state] ?? CartAvailability.UNAVAILABLE;
}

export function isProductDisplayable(
  product?: Product | null,
  options: { requireCompleteMetadata?: boolean } = {},
): boolean {
  const availability = evaluateProductAvailability(product, options);
  return availability !== CartAvailability.UNAVAILABLE;
}
