import { ConflictException } from '@nestjs/common';

import { BASIS_POINTS_SCALE } from '@/common/constants/money.constant';

export function refundAllocation(
  price: number,
  entitlement: number,
  paid: number,
  basisPoints: number,
) {
  const amountsValid =
    [price, entitlement, paid, basisPoints].every(Number.isSafeInteger) &&
    price > 0 &&
    entitlement > 0 &&
    entitlement <= price &&
    paid >= 0 &&
    paid <= price &&
    basisPoints >= 0 &&
    basisPoints <= BASIS_POINTS_SCALE;
  if (!amountsValid) throw new ConflictException('Invalid refund allocation');
  const amount = Math.max(0, entitlement - paid);
  const fee = (remaining: number) =>
    Number(
      (BigInt(remaining) * BigInt(basisPoints)) / BigInt(BASIS_POINTS_SCALE),
    );
  const commissionReversed = fee(price - paid) - fee(price - paid - amount);
  return {
    amount,
    commissionReversed,
    sellerDebit: amount - commissionReversed,
  };
}
