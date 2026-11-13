import { ConflictException, Injectable } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import {
  Checkout,
  CheckoutOrder,
} from '@/modules/checkout/entities/checkout.entity';
import { effectiveShippingQuote } from '@/modules/checkout/shipping-quote.state';

import type { PaymentOrderSnapshot } from './payment.entity';

// Adapt this boundary to freshly quoted server totals when PR #32 lands.
// Never accept a client amount, fee or quote object as an authoritative price.
@Injectable()
export class PaymentPricing {
  async snapshot(
    manager: EntityManager,
    checkout: Checkout,
  ): Promise<PaymentOrderSnapshot[]> {
    const orders = await manager.find(CheckoutOrder, {
      where: { checkoutId: checkout.id },
      order: { id: 'ASC' },
    });
    const quote = await effectiveShippingQuote(manager, checkout, orders);
    if (!orders.length || quote?.status !== 'READY')
      throw new ConflictException('Refresh the shipping quote before paying');
    const snapshots = orders.map((order) => {
      const row = quote.orders.find((item) => item.orderId === order.id);
      if (
        order.sourceType !== 'SHOP' ||
        !row ||
        row.status !== 'QUOTED' ||
        !Number.isSafeInteger(row.fee) ||
        row.fee! < 0
      )
        throw new ConflictException(
          'Only fully quoted Shop orders can be paid',
        );
      return {
        checkoutOrderId: order.id,
        shopId: order.sourceId,
        shopName: order.sourceName,
        subtotal: order.subtotal,
        shippingFee: row.fee!,
        address: order.address,
        items: order.items,
      };
    });
    const total = snapshots.reduce(
      (sum, order) => sum + order.subtotal + order.shippingFee,
      0,
    );
    if (!Number.isSafeInteger(total) || total !== quote.grandTotal)
      throw new ConflictException('Shipping quote total is inconsistent');
    return snapshots;
  }
}
