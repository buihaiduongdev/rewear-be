import { ConflictException } from '@nestjs/common';

import { BASIS_POINTS_SCALE } from '@/common/constants/money.constant';

import { reconciliationMoneySchema } from '../schemas/cod-money.schema';

export function reconciliationMoney(input: unknown) {
  const parsed = reconciliationMoneySchema.safeParse(input);
  if (!parsed.success) throw new ConflictException('Invalid order money');
  const order = parsed.data;
  const commission = Number(
    order.items.reduce(
      (sum, item) =>
        sum +
        (BigInt(item.price) * BigInt(order.commissionBasisPoints)) /
          BigInt(BASIS_POINTS_SCALE),
      0n,
    ),
  );
  return {
    gross: order.subtotal,
    commission,
    sellerNet: order.subtotal - commission,
  };
}
