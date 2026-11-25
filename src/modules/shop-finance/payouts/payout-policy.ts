import { ConflictException } from '@nestjs/common';

import type { PayoutSource, RecipientSnapshot } from './schemas/payout.schema';

export function allocatePayout(
  sources: PayoutSource[],
  amount: number,
): PayoutSource[] {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new ConflictException('Invalid payout amount');
  let remaining = amount;
  const allocations: PayoutSource[] = [];
  for (const source of sources) {
    if (remaining === 0) break;
    const take = Math.min(source.amount, remaining);
    if (take > 0) allocations.push({ ...source, amount: take });
    remaining -= take;
  }
  if (remaining !== 0)
    throw new ConflictException('Insufficient available source funds');
  return allocations;
}

export function assertExactTransfer(
  amount: number,
  recipient: RecipientSnapshot,
  result: RecipientSnapshot & { amount: number },
): void {
  if (
    amount !== result.amount ||
    recipient.bankCode !== result.bankCode ||
    recipient.accountNumber !== result.accountNumber ||
    recipient.accountName !== result.accountName
  )
    throw new ConflictException('Bank evidence does not match payout snapshot');
}
