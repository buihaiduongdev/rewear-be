import { ConflictException, Injectable } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { CheckoutOrder } from '@/modules/checkout/entities/checkout-order.entity';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import type { ShippingQuoteResult } from '@/modules/checkout/schemas/shipping-quote.schema';
import { ShippingQuoteService } from '@/modules/checkout/shipping-quote.service';

import type { PaymentOrderSnapshot } from './payment.entity';

// Never accept a client amount, fee or quote object as an authoritative price.
@Injectable()
export class PaymentPricing {
  constructor(private readonly shipping: ShippingQuoteService) {}

  async quote(buyerId: string, checkoutId: string) {
    // GHN HTTP must finish before acquiring any payment/stock transaction lock.
    return {
      checkoutId,
      quote: await this.shipping.refresh(buyerId, checkoutId),
    };
  }

  async snapshot(
    manager: EntityManager,
    checkout: Checkout,
    prepared: { checkoutId: string; quote: ShippingQuoteResult },
  ): Promise<PaymentOrderSnapshot[]> {
    const orders = await manager.find(CheckoutOrder, {
      where: { checkoutId: checkout.id },
      order: { id: 'ASC' },
      relations: { shop: true },
    });
    const { quote } = prepared;
    const age = Date.now() - Date.parse(quote.quotedAt);
    if (
      !orders.length ||
      prepared.checkoutId !== checkout.id ||
      quote.status !== 'READY' ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > 30000 ||
      quote.orders.length !== orders.length ||
      new Set(quote.orders.map((row) => row.orderId)).size !== orders.length
    )
      throw new ConflictException('Refresh the shipping quote before paying');
    const snapshots = orders.map((order) => {
      const row = quote.orders.find((item) => item.orderId === order.id);
      if (
        !row ||
        row.shopId !== order.shopId ||
        !order.shop ||
        row.status !== 'QUOTED' ||
        !Number.isSafeInteger(row.fee) ||
        row.fee! < 0
      )
        throw new ConflictException(
          'Only fully quoted Shop orders can be paid',
        );
      return {
        checkoutOrderId: order.id,
        shopId: order.shopId,
        shopName: order.shop.name,
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
