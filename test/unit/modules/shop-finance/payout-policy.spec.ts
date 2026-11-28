import {
  allocatePayout,
  assertExactTransfer,
} from '@/modules/shop-finance/shop-payout.service';

describe('manual payout invariants', () => {
  it('locks only exact source amounts and refuses an unfunded request', () => {
    const sources = [
      {
        kind: 'SETTLEMENT' as const,
        sourceId: 's',
        orderId: 'o',
        mode: 'EVIDENCE' as const,
        amount: 100,
      },
    ];
    expect(allocatePayout(sources, 70)).toEqual([
      { ...sources[0], amount: 70 },
    ]);
    expect(() => allocatePayout(sources, 101)).toThrow(
      'Insufficient available source funds',
    );
  });

  it('requires exact received amount and the original recipient', () => {
    const recipient = {
      bankCode: 'VCB',
      accountNumber: '123456',
      accountName: 'Recipient',
    };
    expect(() =>
      assertExactTransfer(100, recipient, { ...recipient, amount: 99 }),
    ).toThrow('Bank evidence does not match payout snapshot');
    expect(() =>
      assertExactTransfer(100, recipient, {
        ...recipient,
        accountNumber: '654321',
        amount: 100,
      }),
    ).toThrow('Bank evidence does not match payout snapshot');
    expect(() =>
      assertExactTransfer(100, recipient, { ...recipient, amount: 100 }),
    ).not.toThrow();
  });
});
