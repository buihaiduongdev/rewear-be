export const PURCHASE_REWARD_DIVISOR = 200;

export function purchaseRewardAmount(
  subtotal: number,
  coinDiscount: number,
  itemRefunds: number,
) {
  return Math.floor(
    Math.max(0, subtotal - coinDiscount - itemRefunds) /
      PURCHASE_REWARD_DIVISOR,
  );
}
