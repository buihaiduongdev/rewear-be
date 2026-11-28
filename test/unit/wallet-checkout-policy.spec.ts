import {
  walletCheckoutTotal,
  walletPoolFields,
} from '@/modules/wallet/wallet-checkout.service';

describe('wallet checkout rules', () => {
  it('requires the exact full confirmed total', () => {
    expect(() =>
      walletCheckoutTotal([{ subtotal: 100, shippingFee: 20 }], 119),
    ).toThrow('total');
    expect(walletCheckoutTotal([{ subtotal: 100, shippingFee: 20 }], 120)).toBe(
      120,
    );
  });
  it('keeps simulation and evidenced pool counters separate', () => {
    expect(walletPoolFields('SIMULATION')).toEqual([
      'simulationBalance',
      'simulationHeldBalance',
    ]);
    expect(walletPoolFields('EVIDENCE')).toEqual(['balance', 'heldBalance']);
  });
});
