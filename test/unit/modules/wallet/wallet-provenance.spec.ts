import { walletProvenance } from '@/modules/wallet/verified-wallet-funds';

describe('Certified wallet provenance', () => {
  it('quarantines legacy money rather than converting it into evidenced funds', () => {
    expect(walletProvenance(200, 0, 80, 0)).toEqual({
      available: 200,
      held: 0,
      backing: 80,
      spendable: 80,
      quarantined: 120,
    });
  });
  it('subtracts both captured debits and reserved balances from new spending', () => {
    expect(walletProvenance(70, 30, 150, 50)).toEqual({
      available: 70,
      held: 30,
      backing: 100,
      spendable: 70,
      quarantined: 0,
    });
    expect(walletProvenance(100, 40, 100, 50).spendable).toBe(10);
  });
  it('does not allow negative backing or unsafe ledger amounts', () => {
    expect(() => walletProvenance(0, 0, 10, 11)).toThrow('Wallet provenance');
    expect(() => walletProvenance(Number.MAX_SAFE_INTEGER, 1, 0, 0)).toThrow(
      'Wallet provenance',
    );
    expect(() => walletProvenance(1, -1, 1, 0)).toThrow('Wallet provenance');
  });
});
