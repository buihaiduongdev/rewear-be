import { ConflictException } from '@nestjs/common';

import { COIN_POLICY } from '../core/constants/coin.constant';

export const COIN_DISCOUNT_DIVISOR = COIN_POLICY.SUBTOTAL_LIMIT_DIVISOR;
export function allocateCoins(
  rows: { id: string; amount: number }[],
  amount: number,
  cap = true,
): Map<string, number> {
  const total = rows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    BigInt(amount) > (cap ? total / BigInt(COIN_DISCOUNT_DIVISOR) : total)
  )
    throw new ConflictException('Coins exceed item subtotal limit');
  const parts = rows.map((row) => ({
    id: row.id,
    value: total ? (BigInt(amount) * BigInt(row.amount)) / total : 0n,
    remainder: total ? (BigInt(amount) * BigInt(row.amount)) % total : 0n,
  }));
  let left = BigInt(amount) - parts.reduce((sum, row) => sum + row.value, 0n);
  parts.sort((a, b) =>
    a.remainder === b.remainder
      ? a.id.localeCompare(b.id)
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (const row of parts) {
    if (left <= 0n) break;
    row.value++;
    left--;
  }
  return new Map(parts.map((row) => [row.id, Number(row.value)]));
}
