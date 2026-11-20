import { ConflictException } from '@nestjs/common';

import { safeBalanceSchema } from '@/common/schemas/money.schema';

/** Unqualified legacy credits remain visible but cannot fund new purchases. */
export function walletProvenance(
  available: number,
  held: number,
  credits: number,
  debits: number,
) {
  const validAmounts = [
    available,
    held,
    credits,
    debits,
    available + held,
  ].every((amount) => safeBalanceSchema.safeParse(amount).success);
  if (!validAmounts || debits > credits)
    throw new ConflictException('Wallet provenance requires reconciliation');
  const backing = credits - debits;
  const spendable = Math.min(available, Math.max(0, backing - held));
  return {
    available,
    held,
    backing,
    spendable,
    quarantined: available - spendable,
  };
}
