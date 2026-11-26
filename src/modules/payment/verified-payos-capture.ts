import type { EntityManager } from 'typeorm';

import { CHECKOUT_STATUS } from '@/modules/checkout/constants/checkout.constant';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import {
  ORDER_PAYMENT_METHOD,
  ORDER_POLICY,
} from '@/modules/order/constants/order.constant';
import type { Order } from '@/modules/order/entities';

import { PAYMENT_ATTEMPT_STATE } from './constants/payment.constant';
import { PaymentAttempt, PaymentRefund } from './entities';

/** Persisted provider capture and immutable order snapshots authorize money, never order fields alone. */
export async function verifiedPayosCapture(
  manager: EntityManager,
  order: Order,
) {
  if (order.paymentMethod !== ORDER_PAYMENT_METHOD.PAYOS || !order.paymentId)
    return null;
  const payment = await manager.findOneBy(PaymentAttempt, {
    id: order.paymentId,
  });
  if (!payment) return null;
  const checkout = await manager.findOneBy(Checkout, {
    id: payment.checkoutId,
  });
  const snapshot = payment.orders.find(
    (row) => row.checkoutOrderId === order.checkoutOrderId,
  );
  const refunded = await manager.existsBy(PaymentRefund, {
    paymentId: payment.id,
    providerTransId: payment.providerTransId ?? '',
  });
  const total = payment.orders.reduce(
    (sum, row) =>
      sum + row.subtotal + row.shippingFee - (row.coinDiscount ?? 0),
    0,
  );
  const captureMatches =
    payment.state === PAYMENT_ATTEMPT_STATE.PAID &&
    Boolean(payment.providerTransId) &&
    payment.paidAt &&
    payment.capturedAmount === payment.amount &&
    Number.isSafeInteger(payment.amount) &&
    payment.amount > 0 &&
    payment.amount === total &&
    !refunded &&
    payment.buyerId === order.buyerId &&
    payment.checkoutId === order.checkoutId &&
    checkout?.status === CHECKOUT_STATUS.PAID &&
    checkout.buyerId === order.buyerId &&
    (!order.deliveryObservedAt || payment.paidAt <= order.deliveryObservedAt);
  const snapshotMatches =
    snapshot &&
    order.commissionBasisPoints ===
      ORDER_POLICY.DEFAULT_COMMISSION_BASIS_POINTS &&
    snapshot.shopId === order.shopId &&
    snapshot.subtotal === order.subtotal &&
    snapshot.shippingFee === order.shippingFee &&
    (snapshot.coinDiscount ?? 0) === (order.coinDiscount ?? 0) &&
    (snapshot.coinMode ?? null) === (order.coinMode ?? null) &&
    (!(order.coinDiscount ?? 0) || order.coinMode === 'SIMULATION') &&
    order.total ===
      order.subtotal + order.shippingFee - (order.coinDiscount ?? 0) &&
    JSON.stringify(snapshot.items) === JSON.stringify(order.items) &&
    JSON.stringify(snapshot.address) === JSON.stringify(order.address);
  return captureMatches && snapshotMatches ? payment : null;
}
