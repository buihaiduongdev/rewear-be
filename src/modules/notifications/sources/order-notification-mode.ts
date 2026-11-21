import type { EntityManager } from 'typeorm';

import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { CodCollection } from '@/modules/cod-reconciliation/entities/cod-reconciliation.entity';
import { ORDER_PAYMENT_METHOD } from '@/modules/order/constants/order.constant';
import type { Order } from '@/modules/order/entities/order.entity';
import { WalletDebit } from '@/modules/wallet/checkout/entities/wallet-checkout.entity';

export async function orderNotificationMode(
  manager: EntityManager,
  order: Order,
) {
  if (order.paymentMethod === ORDER_PAYMENT_METHOD.MOMO)
    return RECONCILIATION_MODE.SIMULATION;
  if (order.walletDebitId)
    return (
      (await manager.findOneBy(WalletDebit, { id: order.walletDebitId }))
        ?.mode ?? null
    );
  return (
    (await manager.findOneBy(CodCollection, { orderId: order.id }))?.mode ??
    order.coinMode ??
    null
  );
}
