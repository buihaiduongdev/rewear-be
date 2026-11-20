import { purchaseRewardAmount } from '@/modules/coins/rewards/policies/purchase-reward.policy';

describe('purchase reward basis', () => {
  it('excludes coin discount and refunded goods before rounding once per order', () => {
    expect(purchaseRewardAmount(100001, 10000, 10002)).toBe(399);
  });
  it('never creates debt when refunds exceed the remaining cash goods', () => {
    expect(purchaseRewardAmount(1000, 100, 1000)).toBe(0);
  });
});
