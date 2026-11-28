import { ShopPayoutService } from '@/modules/shop-finance/shop-payout.service';

describe('payout service authorization', () => {
  it('denies former owners before returning private bank data', async () => {
    const manager = {
      findOneBy: async () => null,
    };
    const db = { manager };
    const service = new ShopPayoutService(db as never);
    await expect(service.ownerView('former', 'shop')).rejects.toThrow(
      'Current active Shop Owner required',
    );
  });
});
