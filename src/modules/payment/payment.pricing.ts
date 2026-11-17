import { ConflictException, Injectable } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { CheckoutOrder } from '@/modules/checkout/entities/checkout-order.entity';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { ShippingQuoteService } from '@/modules/checkout/shipping-quote.service';
import type { ShippingQuoteResult } from '@/modules/checkout/types/shipping-quote.type';

import {
  SHIPPING_QUOTE_MAX_AGE_MS,
  SHIPPING_QUOTE_ORDER_STATUS,
  SHIPPING_QUOTE_STATUS,
} from '../checkout/constants/shipping-quote.constant';
import type { PaymentOrderSnapshot } from './types/payment.type';

// Never accept a client amount, fee or quote object as an authoritative price.
@Injectable()
export class PaymentPricing {
  constructor(private readonly shippingQuoteService: ShippingQuoteService) {}

  async quote(buyerId: string, checkoutId: string) {
    // GHN HTTP must finish before acquiring any payment/stock transaction lock.
    return {
      checkoutId,
      quote: await this.shippingQuoteService.refresh(buyerId, checkoutId),
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
      quote.status !== SHIPPING_QUOTE_STATUS.READY ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > SHIPPING_QUOTE_MAX_AGE_MS ||
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
        row.status !== SHIPPING_QUOTE_ORDER_STATUS.QUOTED ||
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
