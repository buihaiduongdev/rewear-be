import { payoutSourceBalance } from '@/modules/shop-finance/policies/payout-source-balance.policy';

describe('Per-origin payout balance', () => {
  it('subtracts completed and active transfers from the same source only', () => {
    expect(payoutSourceBalance(100, 20, 30, false)).toEqual({
      available: 50,
      paidOutDebt: 0,
      heldShortfall: 0,
      reviewHeld: 0,
    });
  });
  it('surfaces late refund debt without taking another orders funds', () => {
    expect(payoutSourceBalance(10, 60, 20, false)).toEqual({
      available: 0,
      paidOutDebt: 50,
      heldShortfall: 20,
      reviewHeld: 0,
    });
    expect(payoutSourceBalance(100, 0, 0, false).available).toBe(100);
  });
  it('blocks reopened dispute sources including previously reserved payouts', () => {
    expect(payoutSourceBalance(100, 20, 30, true)).toEqual({
      available: 0,
      paidOutDebt: 0,
      heldShortfall: 30,
      reviewHeld: 80,
    });
  });
  it('refuses corrupted unsafe or negative amounts', () => {
    expect(() => payoutSourceBalance(-1, 0, 0, false)).toThrow(
      'Payout source requires reconciliation',
    );
    expect(() =>
      payoutSourceBalance(10, Number.MAX_SAFE_INTEGER + 1, 0, false),
    ).toThrow('Payout source requires reconciliation');
  });
});
