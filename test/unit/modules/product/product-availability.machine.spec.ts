import { CartAvailability } from '@/modules/cart/enums/cart-availability.enum';
import { Product } from '@/modules/product/entities';
import { ProductCondition, ProductStatus } from '@/modules/product/enums';
import {
  evaluateProductAvailability,
  isProductDisplayable,
} from '@/modules/product/machines/product-availability.machine';
import { ShopStatus } from '@/modules/shop/enums';

describe('productAvailabilityMachine (XState)', () => {
  const createBaseProduct = (overrides: Partial<Product> = {}): Product =>
    ({
      id: 'prod-1',
      title: 'Vintage Denim Jacket',
      price: 250000,
      condition: ProductCondition.GOOD,
      status: ProductStatus.ACTIVE,
      shopId: 'shop-1',
      shop: { id: 'shop-1', name: 'Vintage Corner', status: ShopStatus.ACTIVE },
      category: { id: 'cat-1', name: 'Jackets', isActive: true },
      ...overrides,
    }) as Product;

  describe('isProductDisplayable', () => {
    it('returns false for null or undefined product', () => {
      expect(isProductDisplayable(null)).toBe(false);
      expect(isProductDisplayable(undefined)).toBe(false);
    });

    it('rejects non-public statuses (DRAFT, PENDING_REVIEW, REJECTED, SUSPENDED, HIDDEN)', () => {
      const nonPublic = [
        ProductStatus.DRAFT,
        ProductStatus.PENDING_REVIEW,
        ProductStatus.REJECTED,
        ProductStatus.SUSPENDED,
        ProductStatus.HIDDEN,
      ];

      for (const status of nonPublic) {
        const product = createBaseProduct({ status });
        expect(isProductDisplayable(product)).toBe(false);
      }
    });

    it('allows ACTIVE, HELD, SOLD statuses when relations are active', () => {
      for (const status of [
        ProductStatus.ACTIVE,
        ProductStatus.HELD,
        ProductStatus.SOLD,
      ]) {
        const product = createBaseProduct({ status });
        expect(isProductDisplayable(product)).toBe(true);
      }
    });

    it('rejects when shop status is not ACTIVE', () => {
      const product = createBaseProduct({
        shop: {
          id: 'shop-1',
          name: 'Shop',
          status: ShopStatus.INACTIVE,
        } as any,
      });
      expect(isProductDisplayable(product)).toBe(false);
    });

    it('rejects when category is inactive', () => {
      const product = createBaseProduct({
        category: { id: 'cat-1', name: 'Cat', isActive: false } as any,
      });
      expect(isProductDisplayable(product)).toBe(false);
    });

    it('validates complete metadata when requireCompleteMetadata is true', () => {
      const productWithoutPrice = createBaseProduct({ price: null as any });
      expect(
        isProductDisplayable(productWithoutPrice, {
          requireCompleteMetadata: true,
        }),
      ).toBe(false);

      const productZeroPrice = createBaseProduct({ price: 0 });
      expect(
        isProductDisplayable(productZeroPrice, {
          requireCompleteMetadata: true,
        }),
      ).toBe(false);

      const productWithoutTitle = createBaseProduct({ title: '' });
      expect(
        isProductDisplayable(productWithoutTitle, {
          requireCompleteMetadata: true,
        }),
      ).toBe(false);
    });
  });

  describe('evaluateProductAvailability', () => {
    it('returns UNAVAILABLE when product is null', () => {
      expect(evaluateProductAvailability(null)).toBe(
        CartAvailability.UNAVAILABLE,
      );
    });

    it('returns AVAILABLE for active product with active shop/category', () => {
      const product = createBaseProduct({ status: ProductStatus.ACTIVE });
      expect(evaluateProductAvailability(product)).toBe(
        CartAvailability.AVAILABLE,
      );
    });

    it('returns HELD when product status is HELD', () => {
      const product = createBaseProduct({ status: ProductStatus.HELD });
      expect(evaluateProductAvailability(product)).toBe(CartAvailability.HELD);
    });

    it('returns SOLD when product status is SOLD', () => {
      const product = createBaseProduct({ status: ProductStatus.SOLD });
      expect(evaluateProductAvailability(product)).toBe(CartAvailability.SOLD);
    });

    it('returns OWN_PRODUCT when user owns the shop', () => {
      const product = createBaseProduct({
        shopId: 'my-shop-id',
        status: ProductStatus.ACTIVE,
      });
      expect(
        evaluateProductAvailability(product, {
          ownedShopIds: new Set(['my-shop-id']),
        }),
      ).toBe(CartAvailability.OWN_PRODUCT);
    });

    it('returns UNAVAILABLE when shop is inactive even if product is ACTIVE', () => {
      const product = createBaseProduct({
        status: ProductStatus.ACTIVE,
        shop: {
          id: 'shop-1',
          name: 'Shop',
          status: ShopStatus.INACTIVE,
        } as any,
      });
      expect(evaluateProductAvailability(product)).toBe(
        CartAvailability.UNAVAILABLE,
      );
    });
  });
});
