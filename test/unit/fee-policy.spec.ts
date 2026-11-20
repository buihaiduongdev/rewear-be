import {
  buyerFeeDisposition,
  feePaymentWindow,
  refundAllocations,
  withinActualFeeInvoice,
} from '../../src/modules/fees/policies/fee.policy';

describe('verified fee policy', () => {
  it('rejects missing verified invoice amount and any fee beyond the actual invoice', () => {
    expect(withinActualFeeInvoice(1000000, 20000)).toBe(false);
    expect(withinActualFeeInvoice(1000, undefined)).toBe(false);
    expect(withinActualFeeInvoice(20000, 20000)).toBe(true);
    expect(withinActualFeeInvoice(10000, 20000)).toBe(true);
  });
  it('starts the complete original buyer and Shop windows when payable', () => {
    const now = new Date('2026-11-20T03:00:00Z');
    expect(feePaymentWindow('BUYER', now).toISOString()).toBe(
      '2026-11-23T03:00:00.000Z',
    );
    expect(feePaymentWindow('SHOP', now).toISOString()).toBe(
      '2026-11-27T03:00:00.000Z',
    );
  });
  it('absorbs tiny buyer charges only when certified same pool funds are insufficient', () => {
    expect(buyerFeeDisposition(999, 998, 1000)).toBe('ABSORBED');
    expect(buyerFeeDisposition(999, 999, 1000)).toBe('ACTIVE');
    expect(buyerFeeDisposition(1000, 0, 1000)).toBe('ACTIVE');
  });
  it('reserves pending corrections and refunds latest original sources first', () => {
    expect(
      refundAllocations(
        [
          { id: 'old', amount: 80 },
          { id: 'new', amount: 60 },
        ],
        new Map([['new', 10]]),
        90,
      ),
    ).toEqual([
      { collectionId: 'new', amount: 50 },
      { collectionId: 'old', amount: 40 },
    ]);
  });
});
