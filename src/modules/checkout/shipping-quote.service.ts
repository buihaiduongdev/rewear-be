import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { GhnSandboxAdapter } from '@/infrastructure/shipping/ghn-sandbox.adapter';

import { CheckoutOrder } from './entities/checkout-order.entity';
import { Checkout } from './entities/checkout.entity';
import { quoteReasonSchema } from './schemas/shipping-quote.schema';
import { quoteInputs } from './shipping-quote.inputs';

@Injectable()
export class ShippingQuoteService {
  constructor(
    private readonly db: DataSource,
    private readonly carrier: GhnSandboxAdapter,
  ) {}

  async refresh(buyerId: string, checkoutId: string) {
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
            if (!input) throw new Error('PICKUP_REQUIRED');
            const response = await this.carrier.quote(input, signal);
            order.status = 'QUOTED';
            order.fee = response.fee;
            order.estimatedDeliveryAt = response.estimatedDeliveryAt;
          } catch (error) {
            const reason = quoteReasonSchema.safeParse(
              error instanceof Error ? error.message : '',
            );
            order.reason = reason.success ? reason.data : 'CARRIER_UNAVAILABLE';
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
    const quoted = results.filter((order) => order.status === 'QUOTED');
    const status =
      quoted.length === results.length
        ? 'READY'
        : quoted.length
          ? 'PARTIAL'
          : 'UNAVAILABLE';
    const totalShippingFee =
      status === 'READY'
        ? quoted.reduce((sum, order) => sum + order.fee!, 0)
        : null;
    return {
      status,
      environment: 'SANDBOX' as const,
      carrier: 'GHN' as const,
      parcelMethod: 'BOUNDING_STACK_V1' as const,
      quotedAt: new Date().toISOString(),
      orders: results,
      totalShippingFee,
      grandTotal:
        totalShippingFee === null
          ? null
          : orders.reduce((sum, order) => sum + order.subtotal, 0) +
            totalShippingFee,
      currency: 'VND' as const,
      paymentReady: false as const,
    };
  }

  private async assertActive(checkout: Checkout) {
    const [{ now }] = await this.db.query('SELECT clock_timestamp() AS now');
    if (
      checkout.status !== 'HELD' ||
      !checkout.expiresAt ||
      checkout.expiresAt <= new Date(now)
    )
      throw new ConflictException('An active reservation is required');
  }
}
