import { ShopPayoutService } from '@/modules/shop-finance/payouts/shop-payout.service';

describe('payout service authorization', () => {
  it('denies former owners before returning private bank data', async () => {
    const manager = {
      query: async () => [{ now: new Date() }],
      findOneBy: async () => null,
    };
    const db = { transaction: async (fn: Function) => fn(manager) };
    const service = new ShopPayoutService(db as never);
    await expect(service.ownerView('former', 'shop')).rejects.toThrow(
      'Current active Shop Owner required',
    );
  });
});
