import { ConflictException } from '@nestjs/common';

import { safeBalanceSchema } from '@/common/schemas/money.schema';

export function payoutSourceBalance(
  net: number,
  paid: number,
  reserved: number,
  blocked: boolean,
) {
  if (
    ![net, paid, reserved].every(
      (amount) => safeBalanceSchema.safeParse(amount).success,
    )
  )
    throw new ConflictException('Payout source requires reconciliation');
  const remaining = Math.max(0, net - paid);
  const eligible = blocked ? 0 : remaining;
  return {
    available: Math.max(0, eligible - reserved),
    paidOutDebt: Math.max(0, paid - net),
    heldShortfall: Math.max(0, reserved - eligible),
    reviewHeld: blocked ? remaining : 0,
  };
}
