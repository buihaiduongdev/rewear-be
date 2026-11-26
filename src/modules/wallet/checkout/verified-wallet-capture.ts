import { EntityManager } from 'typeorm';

import { CHECKOUT_STATUS } from '@/modules/checkout/constants/checkout.constant';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { ORDER_PAYMENT_METHOD } from '@/modules/order/constants/order.constant';
import { ORDER_POLICY } from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities';

import { WALLET_HOLD_STATE } from './constants/wallet-checkout.constant';
import { WalletCheckoutHold, WalletDebit } from './entities';

export async function verifiedWalletCapture(
  manager: EntityManager,
  order: Order,
) {
  if (
    order.paymentMethod !== ORDER_PAYMENT_METHOD.WALLET ||
    !order.walletDebitId
  )
    return null;
  const debit = await manager.findOneBy(WalletDebit, {
    id: order.walletDebitId,
  });
  if (!debit) return null;
  const hold = await manager.findOneBy(WalletCheckoutHold, {
    id: debit.holdId,
  });
  const checkout = await manager.findOneBy(Checkout, { id: debit.checkoutId });
  const snapshot = hold?.orders.find(
    (row) => row.checkoutOrderId === order.checkoutOrderId,
  );
  const captureMatches =
    hold?.state === WALLET_HOLD_STATE.CAPTURED &&
    hold.capturedAt &&
    hold.buyerId === debit.buyerId &&
    hold.checkoutId === debit.checkoutId &&
    hold.requestId === debit.requestId &&
    hold.mode === debit.mode &&
    hold.amount === debit.amount &&
    hold.amount ===
      hold.orders.reduce(
        (sum, row) =>
          sum + row.subtotal + row.shippingFee - (row.coinDiscount ?? 0),
        0,
      ) &&
    (!order.deliveryObservedAt || hold.capturedAt <= order.deliveryObservedAt);
  const checkoutMatches =
    checkout?.status === CHECKOUT_STATUS.PAID &&
    checkout.buyerId === order.buyerId &&
    debit.buyerId === order.buyerId &&
    debit.checkoutId === order.checkoutId &&
    order.commissionBasisPoints ===
      ORDER_POLICY.DEFAULT_COMMISSION_BASIS_POINTS;
  const snapshotMatches =
    snapshot?.shopId === order.shopId &&
    snapshot.subtotal === order.subtotal &&
    snapshot.shippingFee === order.shippingFee &&
    order.total ===
      order.subtotal + order.shippingFee - (order.coinDiscount ?? 0) &&
    (snapshot.coinDiscount ?? 0) === (order.coinDiscount ?? 0) &&
    (snapshot.coinMode ?? null) === (order.coinMode ?? null) &&
    (!(order.coinDiscount ?? 0) || order.coinMode === debit.mode) &&
    JSON.stringify(snapshot.items) === JSON.stringify(order.items) &&
    JSON.stringify(snapshot.address) === JSON.stringify(order.address);
  return captureMatches && checkoutMatches && snapshotMatches ? debit : null;
}
