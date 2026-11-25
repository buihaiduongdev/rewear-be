import { ConflictException, Injectable } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { CheckoutOrder } from '@/modules/checkout/entities/checkout-order.entity';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { identityQuoteFingerprint } from '@/modules/checkout/identity-quote.policy';
import type { ShippingQuoteResult } from '@/modules/checkout/schemas/shipping-quote.schema';
import { ShippingQuoteService } from '@/modules/checkout/shipping-quote.service';
import { allocateCoins } from '@/modules/coins/checkout/coin-allocation';

import {
  SHIPPING_QUOTE_MAX_AGE_MS,
  SHIPPING_QUOTE_ORDER_STATUS,
  SHIPPING_QUOTE_STATUS,
} from '../checkout/constants/shipping-quote.constant';
import type { PaymentOrderSnapshot } from './schemas/payment.schema';

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
    const needsConfirmation =
      checkout.identityReviewRequired ||
      (checkout.identityConfirmedQuote &&
        checkout.identityConfirmedQuote !==
          identityQuoteFingerprint(checkout, orders, quote));
    if (needsConfirmation)
      throw new ConflictException(
        'Confirm the revised checkout quote before paying',
      );
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
    const allocation = allocateCoins(
      orders.map((order) => ({ id: order.id, amount: order.subtotal })),
      checkout.coinDiscount ?? 0,
    );
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
      const coinDiscount = allocation.get(order.id) ?? 0;
      const itemAllocation = allocateCoins(
        order.items.map((item) => ({ id: item.productId, amount: item.price })),
        coinDiscount,
        false,
      );
      return {
        coinDiscount,
        coinMode: checkout.coinMode ?? null,
        checkoutOrderId: order.id,
        feeDisclosure: checkout.feeDisclosure ?? null,
        shopId: order.shopId,
        shopName: order.shop.name,
        subtotal: order.subtotal,
        shippingFee: row.fee!,
        address: order.address,
        items: order.items.map((item) => ({
          ...item,
          coinDiscount: itemAllocation.get(item.productId) ?? 0,
        })),
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
