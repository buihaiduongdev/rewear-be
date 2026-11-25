import { ConflictException } from '@nestjs/common';

import { MAX_VND_AMOUNT } from '@/common/constants/money.constant';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

export function walletCheckoutTotal(
  orders: { subtotal: number; shippingFee: number; coinDiscount?: number }[],
  expected: number,
) {
  const total = orders.reduce(
    (sum, row) =>
      sum + row.subtotal + row.shippingFee - (row.coinDiscount ?? 0),
    0,
  );
  if (
    !orders.length ||
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    total > MAX_VND_AMOUNT ||
    total !== expected
  )
    throw new ConflictException(
      'Wallet total changed; review the shipping quote',
    );
  return total;
}
export function walletPoolFields(
  mode: ReconciliationMode,
): ['balance' | 'simulationBalance', 'heldBalance' | 'simulationHeldBalance'] {
  return mode === RECONCILIATION_MODE.SIMULATION
    ? ['simulationBalance', 'simulationHeldBalance']
    : ['balance', 'heldBalance'];
}
