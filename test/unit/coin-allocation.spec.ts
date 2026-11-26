import { allocateCoins } from '@/modules/coins/checkout/coin-allocation';
import { walletCheckoutTotal } from '@/modules/wallet/checkout/wallet-checkout.service';

describe('checkout coin allocation', () => {
  it('uses exact largest remainders and stable IDs independent of input order', () => {
    const rows = [
      { id: 'c', amount: 101 },
      { id: 'b', amount: 101 },
      { id: 'a', amount: 101 },
    ];
    expect(Object.fromEntries(allocateCoins(rows, 2))).toEqual({
      a: 1,
      b: 1,
      c: 0,
    });
    expect(Object.fromEntries(allocateCoins([...rows].reverse(), 2))).toEqual({
      a: 1,
      b: 1,
      c: 0,
    });
  });
  it('caps the complete checkout at floor ten percent and rejects fractional coins', () => {
    expect(() => allocateCoins([{ id: 'a', amount: 19 }], 2)).toThrow(
      /Coins exceed|Wallet total changed/,
    );
    expect(() => allocateCoins([{ id: 'a', amount: 100 }], 1.5)).toThrow(
      /Coins exceed|Wallet total changed/,
    );
    expect([...allocateCoins([{ id: 'a', amount: 19 }], 1).values()]).toEqual([
      1,
    ]);
  });
  it('preserves exact products near maximum safe integer without multiplication overflow', () => {
    const rows = [
      { id: 'a', amount: 4000000000000001 },
      { id: 'b', amount: 4000000000000000 },
    ];
    const allocation = allocateCoins(rows, 800000000000000);
    expect([...allocation.values()].reduce((a, b) => a + b, 0)).toBe(
      800000000000000,
    );
    expect(allocation.get('a')).toBe(400000000000000);
  });
  it('allocates order discount only over gross item prices and wallet pays the remainder plus shipping', () => {
    expect([
      ...allocateCoins(
        [
          { id: 'a', amount: 100 },
          { id: 'b', amount: 200 },
        ],
        30,
        false,
      ).values(),
    ]).toEqual([10, 20]);
    expect(
      walletCheckoutTotal(
        [{ subtotal: 300, shippingFee: 50, coinDiscount: 30 }],
        320,
      ),
    ).toBe(320);
    expect(() =>
      walletCheckoutTotal(
        [{ subtotal: 300, shippingFee: 50, coinDiscount: 30 }],
        350,
      ),
    ).toThrow(/Coins exceed|Wallet total changed/);
  });
});
