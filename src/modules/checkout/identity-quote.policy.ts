import { createHash } from 'node:crypto';

import type { CheckoutOrder } from './entities/checkout-order.entity';
import type { Checkout } from './entities/checkout.entity';
import type { ShippingQuoteResult } from './schemas/shipping-quote.schema';

export function identityQuoteFingerprint(
  checkout: Checkout,
  orders: CheckoutOrder[],
  quote: ShippingQuoteResult,
) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        checkoutId: checkout.id,
        coinDiscount: checkout.coinDiscount ?? 0,
        coinMode: checkout.coinMode ?? null,
        orders: orders
          .map((o) => ({
            id: o.id,
            shopId: o.shopId,
            items: o.items,
            subtotal: o.subtotal,
            fee: quote.orders.find((q) => q.orderId === o.id)?.fee ?? null,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      }),
    )
    .digest('hex');
}
