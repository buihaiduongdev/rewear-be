import { feeSourceBalance } from '@/modules/fees/settlement/policies/fee-source-balance.policy';

describe('Attributable Shop fee outflow', () => {
  it('reserves payout money before collecting fees and never makes another source pay the shortage', () => {
    expect(feeSourceBalance(100, 20, 40, 30, false)).toEqual({
      available: 10,
      paidOutDebt: 0,
      feeSourceDebt: 0,
      heldShortfall: 0,
      reviewHeld: 0,
    });
    expect(feeSourceBalance(10, 20, 40, 30, false)).toEqual({
      available: 0,
      paidOutDebt: 10,
      feeSourceDebt: 40,
      heldShortfall: 30,
      reviewHeld: 0,
    });
  });
  it('holds reopened disputed funds without undoing confirmed fee outflow', () => {
    expect(feeSourceBalance(100, 0, 30, 20, true)).toEqual({
      available: 0,
      paidOutDebt: 0,
      feeSourceDebt: 0,
      heldShortfall: 20,
      reviewHeld: 70,
    });
  });
  it('rejects corrupted fee outflow amounts', () => {
    expect(() => feeSourceBalance(10, 0, -1, 0, false)).toThrow('Fee source');
  });
});
