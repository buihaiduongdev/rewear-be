import type { AllocatableLot } from './schemas/coin.schema';

export function allocateLots(
  lots: AllocatableLot[],
  amount: number,
  now: Date,
) {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new Error('Invalid coin amount');
  const result: { grantId: string; amount: number }[] = [];
  const sorted = [...lots].sort(
    (a, b) =>
      (a.expiresAt?.getTime() ?? Infinity) -
        (b.expiresAt?.getTime() ?? Infinity) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
  for (const lot of sorted) {
    if (lot.expiresAt && lot.expiresAt <= now) continue;
    const take = Math.min(
      amount,
      lot.amount -
        lot.held -
        lot.spent -
        lot.recovered -
        (lot.transferred ?? 0),
    );
    if (take > 0) {
      result.push({ grantId: lot.id, amount: take });
      amount -= take;
    }
  }
  if (amount) throw new Error('Insufficient available coins');
  return result;
}
