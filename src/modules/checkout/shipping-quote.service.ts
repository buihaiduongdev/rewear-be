import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { MONEY_CURRENCY } from '@/common/constants/money.constant';
import { GhnSandboxAdapter } from '@/infrastructure/shipping/adapters/ghn-sandbox.adapter';
import { CHECKOUT_STATUS } from '@/modules/checkout/constants/checkout.constant';
import { shopAllowsIdentitySales } from '@/modules/shop/applications/renewal/identity-sale.policy';

import {
  SHIPPING_QUOTE_CARRIER,
  SHIPPING_QUOTE_ENVIRONMENT,
  SHIPPING_QUOTE_ORDER_STATUS,
  SHIPPING_QUOTE_PARCEL_METHOD,
  SHIPPING_QUOTE_REASON,
  SHIPPING_QUOTE_STATUS,
} from './constants/shipping-quote.constant';
import { CheckoutOrder } from './entities/checkout-order.entity';
import { Checkout } from './entities/checkout.entity';
import { pruneIdentityCheckout } from './identity-checkout.policy';
import { identityQuoteFingerprint } from './identity-quote.policy';
import { quoteReasonSchema } from './schemas/shipping-quote.schema';
import { quoteInputs } from './shipping-quote.inputs';
import type { ShippingQuoteResult } from './types/shipping-quote.type';

@Injectable()
export class ShippingQuoteService {
  constructor(
    private readonly db: DataSource,
    private readonly carrier: GhnSandboxAdapter,
  ) {}

  async refresh(
    buyerId: string,
    checkoutId: string,
  ): Promise<ShippingQuoteResult> {
    await this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      const row = await manager.findOneByOrFail(Checkout, {
        id: checkoutId,
        buyerId,
      });
      await pruneIdentityCheckout(manager, row, new Date(now));
    });
    const checkout = await this.db.getRepository(Checkout).findOneByOrFail({
      id: checkoutId,
      buyerId,
    });
    await this.assertActive(checkout);
    const orders = await this.db.getRepository(CheckoutOrder).find({
      where: { checkoutId },
      order: { id: 'ASC' },
      relations: { shop: true },
    });
    const { inputs, results } = await quoteInputs(this.db.manager, orders);
    await this.quoteOrders(inputs, results);
    const currentCheckout = await this.db
      .getRepository(Checkout)
      .findOneByOrFail({
        id: checkoutId,
        buyerId,
      });
    await this.assertActive(currentCheckout);
    const quoted = results.filter(
      (order) => order.status === SHIPPING_QUOTE_ORDER_STATUS.QUOTED,
    );
    const status =
      quoted.length === results.length
        ? SHIPPING_QUOTE_STATUS.READY
        : quoted.length
          ? SHIPPING_QUOTE_STATUS.PARTIAL
          : SHIPPING_QUOTE_STATUS.UNAVAILABLE;
    const totalShippingFee =
      status === SHIPPING_QUOTE_STATUS.READY
        ? quoted.reduce((sum, order) => sum + order.fee!, 0)
        : null;
    const result: ShippingQuoteResult = {
      status,
      environment: SHIPPING_QUOTE_ENVIRONMENT.SANDBOX,
      carrier: SHIPPING_QUOTE_CARRIER.GHN,
      parcelMethod: SHIPPING_QUOTE_PARCEL_METHOD.BOUNDING_STACK_V1,
      quotedAt: new Date().toISOString(),
      orders: results,
      totalShippingFee,
      grandTotal:
        totalShippingFee === null
          ? null
          : orders.reduce((sum, order) => sum + order.subtotal, 0) +
            totalShippingFee,
      currency: MONEY_CURRENCY.VND,
      paymentReady: false as const,
    };
    result.identityReviewRequired = !!currentCheckout.identityReviewRequired;
    result.identityQuoteFingerprint = identityQuoteFingerprint(
      currentCheckout,
      orders,
      result,
    );
    return result;
  }

  async confirmIdentityReview(
    buyerId: string,
    checkoutId: string,
    fingerprint: string,
  ) {
    const quote = await this.refresh(buyerId, checkoutId);
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      const checkout = await manager.findOneByOrFail(Checkout, {
        id: checkoutId,
        buyerId,
      });
      const orders = await manager.find(CheckoutOrder, {
        where: { checkoutId },
        relations: { shop: true },
        order: { id: 'ASC' },
      });
      const eligible =
        orders.length > 0 &&
        orders.every((order) =>
          shopAllowsIdentitySales(order.shop, new Date(now)),
        );
      const validQuote =
        quote.status === SHIPPING_QUOTE_STATUS.READY &&
        fingerprint === quote.identityQuoteFingerprint &&
        fingerprint === identityQuoteFingerprint(checkout, orders, quote);
      const active =
        checkout.status === CHECKOUT_STATUS.HELD &&
        checkout.expiresAt &&
        checkout.expiresAt > new Date(now);
      if (!eligible || !validQuote || !active)
        throw new ConflictException(
          'Refresh and confirm the remaining Shop orders',
        );
      checkout.identityReviewRequired = false;
      checkout.identityConfirmedQuote = fingerprint;
      await manager.save(checkout);
      return { ...quote, identityReviewRequired: false };
    });
  }
  private async quoteOrders(
    inputs: Awaited<ReturnType<typeof quoteInputs>>['inputs'],
    results: Awaited<ReturnType<typeof quoteInputs>>['results'],
  ) {
    const signal = AbortSignal.timeout(8000);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, results.length) }, async () => {
        while (next < results.length) {
          const index = next++;
          const order = results[index];
          if (order.reason) continue;
          try {
            const input = inputs[index];
            if (!input) throw new Error(SHIPPING_QUOTE_REASON.PICKUP_REQUIRED);
            const response = await this.carrier.quote(input, signal);
            order.status = SHIPPING_QUOTE_ORDER_STATUS.QUOTED;
            order.fee = response.fee;
            order.estimatedDeliveryAt = response.estimatedDeliveryAt;
          } catch (error) {
            const reason = quoteReasonSchema.safeParse(
              error instanceof Error ? error.message : '',
            );
            order.reason = reason.success
              ? reason.data
              : SHIPPING_QUOTE_REASON.CARRIER_UNAVAILABLE;
          }
        }
      }),
    );
  }

  private async assertActive(checkout: Checkout) {
    const [{ now }] = await this.db.query('SELECT clock_timestamp() AS now');
    const reservationIsInactive =
      checkout.status !== CHECKOUT_STATUS.HELD ||
      !checkout.expiresAt ||
      checkout.expiresAt <= new Date(now);
    if (reservationIsInactive)
      throw new ConflictException('An active reservation is required');
  }
}
