import { ProductStatus } from '@/modules/product/enums';
import {
  canTransitionProductStatus,
  getNextProductStatus,
} from '@/modules/product/machines/product-lifecycle.machine';

describe('productLifecycleMachine (XState)', () => {
  describe('Valid state transitions', () => {
    it('transitions from DRAFT to PENDING_REVIEW upon SUBMIT_FOR_REVIEW', () => {
      expect(
        canTransitionProductStatus(ProductStatus.DRAFT, {
          type: 'SUBMIT_FOR_REVIEW',
        }),
      ).toBe(true);
      expect(
        getNextProductStatus(ProductStatus.DRAFT, {
          type: 'SUBMIT_FOR_REVIEW',
        }),
      ).toBe(ProductStatus.PENDING_REVIEW);
    });

    it('transitions from PENDING_REVIEW to DRAFT upon WITHDRAW_REVIEW', () => {
      expect(
        getNextProductStatus(ProductStatus.PENDING_REVIEW, {
          type: 'WITHDRAW_REVIEW',
        }),
      ).toBe(ProductStatus.DRAFT);
    });

    it('transitions from PENDING_REVIEW to ACTIVE upon APPROVE', () => {
      expect(
        getNextProductStatus(ProductStatus.PENDING_REVIEW, {
          type: 'APPROVE',
        }),
      ).toBe(ProductStatus.ACTIVE);
    });

    it('transitions from PENDING_REVIEW to REJECTED upon REJECT', () => {
      expect(
        getNextProductStatus(ProductStatus.PENDING_REVIEW, {
          type: 'REJECT',
          reason: 'Poor photo quality',
        }),
      ).toBe(ProductStatus.REJECTED);
    });

    it('allows toggling between ACTIVE and HIDDEN', () => {
      expect(getNextProductStatus(ProductStatus.ACTIVE, { type: 'HIDE' })).toBe(
        ProductStatus.HIDDEN,
      );
      expect(
        getNextProductStatus(ProductStatus.HIDDEN, { type: 'UNHIDE' }),
      ).toBe(ProductStatus.ACTIVE);
    });

    it('allows holding and selling an ACTIVE product', () => {
      expect(getNextProductStatus(ProductStatus.ACTIVE, { type: 'HOLD' })).toBe(
        ProductStatus.HELD,
      );
      expect(getNextProductStatus(ProductStatus.HELD, { type: 'SELL' })).toBe(
        ProductStatus.SOLD,
      );
      expect(
        getNextProductStatus(ProductStatus.HELD, { type: 'RELEASE_HOLD' }),
      ).toBe(ProductStatus.ACTIVE);
    });

    it('allows re-submitting from REJECTED or SUSPENDED to PENDING_REVIEW', () => {
      expect(
        getNextProductStatus(ProductStatus.REJECTED, {
          type: 'SUBMIT_FOR_REVIEW',
        }),
      ).toBe(ProductStatus.PENDING_REVIEW);
      expect(
        getNextProductStatus(ProductStatus.SUSPENDED, {
          type: 'SUBMIT_FOR_REVIEW',
        }),
      ).toBe(ProductStatus.PENDING_REVIEW);
    });
  });

  describe('Invalid state transitions', () => {
    it('disallows jumping from DRAFT to ACTIVE directly', () => {
      expect(
        canTransitionProductStatus(ProductStatus.DRAFT, { type: 'APPROVE' }),
      ).toBe(false);
      expect(
        getNextProductStatus(ProductStatus.DRAFT, { type: 'APPROVE' }),
      ).toBeNull();
    });

    it('disallows modifying SOLD product (final state)', () => {
      expect(
        canTransitionProductStatus(ProductStatus.SOLD, { type: 'HOLD' }),
      ).toBe(false);
      expect(
        canTransitionProductStatus(ProductStatus.SOLD, {
          type: 'SUBMIT_FOR_REVIEW',
        }),
      ).toBe(false);
    });
  });
});
