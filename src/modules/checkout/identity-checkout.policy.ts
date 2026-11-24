import { type EntityManager, In } from 'typeorm';

import { CoinService } from '@/modules/coins/core/coin.service';
import { PAYMENT_ATTEMPT_STATE } from '@/modules/payment/constants/payment.constant';
import { PaymentAttempt } from '@/modules/payment/entities/payment.entity';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { shopAllowsIdentitySales } from '@/modules/shop/applications/renewal/identity-sale.policy';
import { WALLET_HOLD_STATE } from '@/modules/wallet/checkout/constants/wallet-checkout.constant';
import { WalletCheckoutHold } from '@/modules/wallet/checkout/entities/wallet-checkout.entity';
import { releaseWalletHold } from '@/modules/wallet/checkout/release-wallet-hold';

import {
  CHECKOUT_REMOVAL_REASON,
  CHECKOUT_STATUS,
} from './constants/checkout.constant';
import { CheckoutOrder } from './entities/checkout-order.entity';
import { Checkout } from './entities/checkout.entity';

/** Caller holds the shared commerce lock. Never rewrite an unresolved provider amount. */
export async function pruneIdentityCheckout(
  manager: EntityManager,
  checkout: Checkout,
  now: Date,
) {
  const active =
    checkout.status === CHECKOUT_STATUS.HELD &&
    checkout.expiresAt &&
    checkout.expiresAt > now;
  if (!active) return;
  const orders = await manager.find(CheckoutOrder, {
    where: { checkoutId: checkout.id },
    relations: { shop: true },
    order: { id: 'ASC' },
  });
  const removed = orders.filter((o) => !shopAllowsIdentitySales(o.shop, now));
  if (!removed.length) return;
  checkout.identityReviewRequired = true;
  checkout.identityConfirmedQuote = null;
  const unresolved = await manager.existsBy(PaymentAttempt, {
    checkoutId: checkout.id,
    state: In([
      PAYMENT_ATTEMPT_STATE.CREATING,
      PAYMENT_ATTEMPT_STATE.PENDING,
      PAYMENT_ATTEMPT_STATE.UNKNOWN,
      PAYMENT_ATTEMPT_STATE.PAID,
      PAYMENT_ATTEMPT_STATE.REFUND_REQUIRED,
    ]),
  });
  if (unresolved) {
    await manager.save(checkout);
    return;
  }
  const holds = await manager.find(WalletCheckoutHold, {
    where: { checkoutId: checkout.id, state: WALLET_HOLD_STATE.HELD },
  });
  for (const hold of holds)
    await releaseWalletHold(manager, hold, now, WALLET_HOLD_STATE.RELEASED);
  await new CoinService().releaseCheckoutCoins(manager, checkout.id, now);
  checkout.coinDiscount = 0;
  checkout.coinMode = null;
  for (const order of removed) {
    for (const item of order.items) {
      await manager.update(
        Product,
        {
          id: item.productId,
          reservationId: checkout.id,
          status: ProductStatus.HELD,
        },
        { status: ProductStatus.ACTIVE, reservationId: null, heldUntil: null },
      );
      if (!checkout.removedItems.some((r) => r.productId === item.productId))
        checkout.removedItems.push({
          productId: item.productId,
          reason: CHECKOUT_REMOVAL_REASON.IDENTITY_RESTRICTED,
        });
    }
    await manager.delete(CheckoutOrder, { id: order.id });
  }
  if (removed.length === orders.length) {
    checkout.status = CHECKOUT_STATUS.EMPTY;
    checkout.identityReviewRequired = false;
  }
  await manager.save(checkout);
}
