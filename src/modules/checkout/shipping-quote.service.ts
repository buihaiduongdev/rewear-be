import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { MONEY_CURRENCY } from '@/common/constants/money.constants';
import { GhnSandboxAdapter } from '@/infrastructure/shipping/ghn-sandbox.adapter';
import { CHECKOUT_STATUS } from '@/modules/checkout/checkout.constants';

import { CheckoutOrder } from './entities/checkout-order.entity';
import { Checkout } from './entities/checkout.entity';
import { quoteReasonSchema } from './schemas/shipping-quote.schema';
import {
  SHIPPING_QUOTE_CARRIER,
  SHIPPING_QUOTE_ENVIRONMENT,
  SHIPPING_QUOTE_ORDER_STATUS,
  SHIPPING_QUOTE_PARCEL_METHOD,
  SHIPPING_QUOTE_REASON,
  SHIPPING_QUOTE_STATUS,
} from './shipping-quote.constants';
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
    const checkout = await this.db.getRepository(Checkout).findOneByOrFail({
      id: checkoutId,
      buyerId,
    });
    await this.assertActive(checkout);
    const orders = await this.db.getRepository(CheckoutOrder).find({
      where: { checkoutId },
      order: { id: 'ASC' },
    });
    const { inputs, results } = await quoteInputs(this.db.manager, orders);
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
    return {
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
  }

  private async assertActive(checkout: Checkout) {
    const [{ now }] = await this.db.query('SELECT clock_timestamp() AS now');
    if (
      checkout.status !== CHECKOUT_STATUS.HELD ||
      !checkout.expiresAt ||
      checkout.expiresAt <= new Date(now)
    )
      throw new ConflictException('An active reservation is required');
  }
}
