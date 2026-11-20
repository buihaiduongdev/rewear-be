import { refundAllocation } from '@/modules/dispute/policies/refund-allocation.policy';

describe('Item refund allocation', () => {
  it('refunds only the increase in entitlement, never adds overlapping issue ceilings', () => {
    expect(refundAllocation(100001, 100001, 40000, 300)).toEqual({
      amount: 60001,
      commissionReversed: 1800,
      sellerDebit: 58201,
    });
    expect(refundAllocation(100001, 100001, 100001, 300)).toEqual({
      amount: 0,
      commissionReversed: 0,
      sellerDebit: 0,
    });
  });
  it('uses snapshot floor rounding before and after partial refund', () => {
    expect(refundAllocation(101, 50, 0, 300)).toEqual({
      amount: 50,
      commissionReversed: 2,
      sellerDebit: 48,
    });
  });
  it('rejects invalid ceilings, paid totals and commission instead of clamping corruption', () => {
    for (const values of [
      [100, 101, 0, 300],
      [100, 10, 101, 300],
      [100, 10, -1, 300],
      [100, 10, 0, 10001],
      [100, 0, 0, 300],
    ])
      expect(() =>
        refundAllocation(...(values as [number, number, number, number])),
      ).toThrow('Invalid refund allocation');
  });
});
