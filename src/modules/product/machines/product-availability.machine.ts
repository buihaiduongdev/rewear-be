import { createActor, setup } from 'xstate';

import { CartAvailability } from '@/modules/cart/enums/cart-availability.enum';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { shopAllowsIdentitySales } from '@/modules/shop/applications/renewal/identity-sale.policy';
import { ShopStatus } from '@/modules/shop/enums';

export interface ProductAvailabilityContext {
  product?: Product | null;
  /** Danh sách shopId thuộc quyền sở hữu của người dùng hiện tại (nếu có) */
  ownedShopIds?: Set<string> | readonly string[];
  /** Bắt buộc kiểm tra các trường metadata thương mại hoàn chỉnh (tiêu đề, giá > 0, tình trạng) */
  requireCompleteMetadata?: boolean;
  requirePurchaseEligibility?: boolean;
}

export type ProductAvailabilityState =
  'evaluating' | 'available' | 'held' | 'sold' | 'ownProduct' | 'unavailable';

/**
 * XState State Machine kiểm soát và đánh giá mức độ khả dụng của sản phẩm.
 * Chuẩn hóa toàn bộ guard theo dạng declarative, có thể visual hóa trên Stately Studio.
 */
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

    isOwnerViewingOwnProduct: ({ context }) => {
      if (!context.ownedShopIds || !context.product) {
        return false;
      }
      const shopId = context.product.shopId;
      return context.ownedShopIds instanceof Set
        ? context.ownedShopIds.has(shopId)
        : context.ownedShopIds.includes(shopId);
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
        { target: 'ownProduct', guard: 'isOwnerViewingOwnProduct' },
        { target: 'held', guard: 'isHeld' },
        { target: 'sold', guard: 'isSold' },
        { target: 'available', guard: 'isActive' },
        { target: 'unavailable' },
      ],
    },
    available: { type: 'final' },
    held: { type: 'final' },
    sold: { type: 'final' },
    ownProduct: { type: 'final' },
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
  ownProduct: CartAvailability.OWN_PRODUCT,
  unavailable: CartAvailability.UNAVAILABLE,
};

export interface EvaluateProductAvailabilityOptions {
  ownedShopIds?: Set<string> | readonly string[];
  requireCompleteMetadata?: boolean;
  requirePurchaseEligibility?: boolean;
}

/**
 * Đánh giá trạng thái CartAvailability của sản phẩm thông qua máy trạng thái XState.
 */
export function evaluateProductAvailability(
  product?: Product | null,
  options: EvaluateProductAvailabilityOptions = {},
): CartAvailability {
  const actor = createActor(productAvailabilityMachine, {
    input: {
      product,
      requirePurchaseEligibility: options.requirePurchaseEligibility,
      ownedShopIds: options.ownedShopIds,
      requireCompleteMetadata: options.requireCompleteMetadata,
    },
  });
  actor.start();
  const state = actor.getSnapshot().value as ProductAvailabilityState;
  actor.stop();

  return STATE_TO_AVAILABILITY_MAP[state] ?? CartAvailability.UNAVAILABLE;
}

/**
 * Kiểm tra nhanh sản phẩm có đủ điều kiện hiển thị công khai tới người mua hay không.
 */
export function isProductDisplayable(
  product?: Product | null,
  options: { requireCompleteMetadata?: boolean } = {},
): boolean {
  const availability = evaluateProductAvailability(product, options);
  return availability !== CartAvailability.UNAVAILABLE;
}
