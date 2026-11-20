import { ConflictException } from '@nestjs/common';

export const COIN_DISCOUNT_DIVISOR = 10;
export function allocateCoins(
  rows: { id: string; amount: number }[],
  amount: number,
  cap = true,
): Map<string, number> {
  const total = rows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    BigInt(amount) > (cap ? total / 10n : total)
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
