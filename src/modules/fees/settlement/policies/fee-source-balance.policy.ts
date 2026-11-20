import { ConflictException } from '@nestjs/common';

import { safeBalanceSchema } from '@/common/schemas/money.schema';
import { payoutSourceBalance } from '@/modules/shop-finance/policies/payout-source-balance.policy';

export function feeSourceBalance(
  net: number,
  paid: number,
  feeSpent: number,
  reserved: number,
  blocked: boolean,
) {
  const validOutflow =
    safeBalanceSchema.safeParse(feeSpent).success &&
    safeBalanceSchema.safeParse(paid + feeSpent).success;
  if (!validOutflow)
    throw new ConflictException('Fee source requires reconciliation');
  const result = payoutSourceBalance(net, paid + feeSpent, reserved, blocked);
  return {
    ...result,
    paidOutDebt: Math.max(0, paid - net),
    feeSourceDebt: Math.max(0, feeSpent - Math.max(0, net - paid)),
  };
}
