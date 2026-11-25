import type { EntityManager } from 'typeorm';

import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import type { Order } from '@/modules/order/entities';

import { CoinOrderDebit } from './entities';

export async function verifiedOrderCoinDebit(
  manager: EntityManager,
  order: Order,
  mode: ReconciliationMode,
) {
  const amount = order.coinDiscount ?? 0;
  if (amount === 0) return true;
  if (!Number.isSafeInteger(amount) || amount < 0 || order.coinMode !== mode)
    return false;
  const debit = await manager.findOneBy(CoinOrderDebit, { orderId: order.id });
  return (
    !!debit &&
    debit.amount === amount &&
    debit.buyerId === order.buyerId &&
    debit.mode === mode
  );
}
