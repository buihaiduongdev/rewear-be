import { allocateLots } from '../../../src/modules/coins/core/coin-allocation';

describe('coin lot allocation', () => {
  it('spends earliest expiry before nonexpiring rewards and never spends held or expired coins', () => {
    const now = new Date('2026-11-21');
    const lots = [
      {
        id: 'reward',
        amount: 100,
        held: 20,
        spent: 0,
        recovered: 0,
        expiresAt: null,
        createdAt: now,
      },
      {
        id: 'expired',
        amount: 100,
        held: 0,
        spent: 0,
        recovered: 0,
        expiresAt: new Date('2026-11-20'),
        createdAt: now,
      },
      {
        id: 'promo',
        amount: 40,
        held: 10,
        spent: 0,
        recovered: 0,
        expiresAt: new Date('2026-11-22'),
        createdAt: now,
      },
    ];
    expect(allocateLots(lots, 50, now)).toEqual([
      { grantId: 'promo', amount: 30 },
      { grantId: 'reward', amount: 20 },
    ]);
    expect(() => allocateLots(lots, 111, now)).toThrow(
      'Insufficient available coins',
    );
  });
});
