import { refundAllocation } from '@/modules/dispute/dispute-refund.service';

describe('Item refund allocation', () => {
  it('computes full item refund and commission reversal accurately', () => {
    expect(refundAllocation(100001, 100001, 300)).toEqual({
      amount: 100001,
      commissionReversed: 3000,
      sellerDebit: 97001,
    });
    expect(refundAllocation(100001, 40000, 300)).toEqual({
      amount: 40000,
      commissionReversed: 1200,
      sellerDebit: 38800,
    });
  });

  it('uses snapshot floor rounding before and after partial refund', () => {
    expect(refundAllocation(101, 50, 300)).toEqual({
      amount: 50,
      commissionReversed: 2,
      sellerDebit: 48,
    });
  });

  it('rejects invalid ceilings and commission instead of clamping corruption', () => {
    for (const values of [
      [100, 101, 300],
      [100, 10, 10001],
      [100, 0, 300],
      [0, 0, 300],
      [100, 10, -1],
    ]) {
      expect(() =>
        refundAllocation(...(values as [number, number, number])),
      ).toThrow('Invalid refund allocation');
    }
  });
});
