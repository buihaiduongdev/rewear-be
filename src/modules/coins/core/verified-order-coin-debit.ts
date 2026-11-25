import type { EntityManager } from 'typeorm';

import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import type { Order } from '@/modules/order/entities';

import { CoinGrant, CoinOrderDebit, CoinReservation } from './entities';

/** An order field alone never authorizes platform subsidy. Require persisted spend evidence. */
export async function verifiedOrderCoinDebit(
  manager: EntityManager,
  order: Order,
  mode: ReconciliationMode,
) {
  const amount = order.coinDiscount ?? 0;
  if (amount === 0) return true;
  const debit = await manager.findOneBy(CoinOrderDebit, { orderId: order.id });
  const matches =
    debit &&
    debit.amount === amount &&
    debit.buyerId === order.buyerId &&
    debit.mode === mode &&
    order.coinMode === mode &&
    debit.allocations.reduce((sum, row) => sum + row.amount, 0) === amount;
  if (
    !matches ||
    new Set(debit.allocations.map((row) => row.grantId)).size !==
      debit.allocations.length
  )
    return false;
  for (const allocation of debit.allocations) {
    const grant = await manager.findOneBy(CoinGrant, {
      id: allocation.grantId,
    });
    const reservations = await manager.findBy(CoinReservation, {
      orderId: order.id,
      grantId: allocation.grantId,
      state: 'CONSUMED',
    });
    const validAllocation =
      Number.isSafeInteger(allocation.amount) &&
      allocation.amount > 0 &&
      grant?.buyerId === order.buyerId &&
      grant.mode === mode &&
      grant.spent >= allocation.amount &&
      (grant.rootGrantId ?? grant.id) === allocation.rootGrantId &&
      reservations.reduce((sum, row) => sum + row.amount, 0) ===
        allocation.amount;
    if (!validAllocation) return false;
  }
  return true;
}
