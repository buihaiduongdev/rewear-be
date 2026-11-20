import { ORDER_STATUS } from '@/modules/order/constants';
import {
  canTransitionOrderStatus,
  getNextOrderStatus,
} from '@/modules/order/machines/order-fulfillment.machine';

describe('orderFulfillmentMachine (XState)', () => {
  describe('Standard flow (Happy path)', () => {
    it('transitions from WAITING to PENDING upon PAYMENT_RECEIVED', () => {
      expect(
        getNextOrderStatus(ORDER_STATUS.WAITING, { type: 'PAYMENT_RECEIVED' }),
      ).toBe(ORDER_STATUS.PENDING);
    });

    it('transitions from PENDING to PREPARING upon SELLER_ACCEPT within deadline', () => {
      const futureDeadline = new Date(Date.now() + 24 * 3600 * 1000);
      expect(
        getNextOrderStatus(
          ORDER_STATUS.PENDING,
          { type: 'SELLER_ACCEPT' },
          { sellerConfirmBy: futureDeadline },
        ),
      ).toBe(ORDER_STATUS.PREPARING);
    });

    it('blocks SELLER_ACCEPT when confirmation deadline has passed', () => {
      const pastDeadline = new Date(Date.now() - 1000);
      expect(
        canTransitionOrderStatus(
          ORDER_STATUS.PENDING,
          { type: 'SELLER_ACCEPT' },
          { sellerConfirmBy: pastDeadline },
        ),
      ).toBe(false);
    });

    it('transitions from PREPARING to SHIPPING upon DISPATCH_SHIPPING', () => {
      expect(
        getNextOrderStatus(ORDER_STATUS.PREPARING, {
          type: 'DISPATCH_SHIPPING',
        }),
      ).toBe(ORDER_STATUS.SHIPPING);
    });

    it('transitions from SHIPPING to DELIVERED upon DELIVERY_SUCCESS', () => {
      expect(
        getNextOrderStatus(ORDER_STATUS.SHIPPING, {
          type: 'DELIVERY_SUCCESS',
        }),
      ).toBe(ORDER_STATUS.DELIVERED);
    });

    it('transitions from DELIVERED to COMPLETED upon BUYER_CONFIRM', () => {
      expect(
        getNextOrderStatus(ORDER_STATUS.DELIVERED, { type: 'BUYER_CONFIRM' }),
      ).toBe(ORDER_STATUS.COMPLETED);
    });

    it('transitions from DELIVERED to COMPLETED upon SETTLEMENT_DUE when 72h passed', () => {
      const pastDisputeDeadline = new Date(Date.now() - 1000);
      expect(
        getNextOrderStatus(
          ORDER_STATUS.DELIVERED,
          { type: 'SETTLEMENT_DUE' },
          { disputeDeadlineAt: pastDisputeDeadline },
        ),
      ).toBe(ORDER_STATUS.COMPLETED);
    });

    it('blocks SETTLEMENT_DUE if 72h dispute window has not passed yet', () => {
      const futureDisputeDeadline = new Date(Date.now() + 72 * 3600 * 1000);
      expect(
        canTransitionOrderStatus(
          ORDER_STATUS.DELIVERED,
          { type: 'SETTLEMENT_DUE' },
          { disputeDeadlineAt: futureDisputeDeadline },
        ),
      ).toBe(false);
    });
  });

  describe('Cancellation and Dispute flows', () => {
    it('allows seller reject or timeout cancellation from PENDING', () => {
      expect(
        getNextOrderStatus(ORDER_STATUS.PENDING, { type: 'SELLER_REJECT' }),
      ).toBe(ORDER_STATUS.CANCELLED);
      expect(
        getNextOrderStatus(ORDER_STATUS.PENDING, { type: 'TIMEOUT_EXPIRED' }),
      ).toBe(ORDER_STATUS.CANCELLED);
    });

    it('allows raising dispute from DELIVERED', () => {
      expect(
        getNextOrderStatus(ORDER_STATUS.DELIVERED, { type: 'RAISE_DISPUTE' }),
      ).toBe(ORDER_STATUS.DISPUTE);
    });

    it('transitions from DISPUTE to RETURNS or COMPLETED', () => {
      expect(
        getNextOrderStatus(ORDER_STATUS.DISPUTE, { type: 'RESOLVE_RETURN' }),
      ).toBe(ORDER_STATUS.RETURNS);
      expect(
        getNextOrderStatus(ORDER_STATUS.DISPUTE, { type: 'RESOLVE_DISMISS' }),
      ).toBe(ORDER_STATUS.COMPLETED);
    });

    it('disallows invalid jumps (e.g. WAITING directly to SHIPPING)', () => {
      expect(
        canTransitionOrderStatus(ORDER_STATUS.WAITING, {
          type: 'DISPATCH_SHIPPING',
        }),
      ).toBe(false);
      expect(
        canTransitionOrderStatus(ORDER_STATUS.COMPLETED, {
          type: 'SELLER_ACCEPT',
        }),
      ).toBe(false);
    });
  });
});
