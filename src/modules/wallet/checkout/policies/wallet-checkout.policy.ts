import { ConflictException } from '@nestjs/common';

import { MAX_VND_AMOUNT } from '@/common/constants/money.constant';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';

export function walletCheckoutTotal(
  orders: { subtotal: number; shippingFee: number }[],
  expected: number,
) {
  const total = orders.reduce(
    (sum, row) => sum + row.subtotal + row.shippingFee,
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
