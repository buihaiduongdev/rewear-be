import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource } from 'typeorm';

import { GhnSandboxAdapter } from '@/infrastructure/shipping/ghn-sandbox.adapter';

import { Checkout, CheckoutOrder } from './entities/checkout.entity';
import { CheckoutShippingQuote } from './entities/shipping-quote.entity';
import { quoteReasonSchema } from './schemas/shipping-quote.schema';
import {
  databaseNow,
  effectiveShippingQuote,
  invalidateQuote,
  quoteInputs,
} from './shipping-quote.state';

@Injectable()
export class ShippingQuoteService {
  constructor(
    private readonly db: DataSource,
    private readonly carrier: GhnSandboxAdapter,
  ) {}
  async refresh(buyerId: string, checkoutId: string) {
    const prepared = await this.db.transaction(async (manager) => {
      const checkout = await manager.findOne(Checkout, {
        where: { id: checkoutId, buyerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!checkout) throw new NotFoundException('Checkout not found');
      const now = await databaseNow(manager);
      if (
        checkout.status !== 'HELD' ||
        !checkout.expiresAt ||
        checkout.expiresAt <= now
      )
        throw new ConflictException('An active reservation is required');
      const orders = await manager.find(CheckoutOrder, {
        where: { checkoutId },
        order: { id: 'ASC' },
      });
      const context = await quoteInputs(manager, checkout, orders);
      const existing = await effectiveShippingQuote(manager, checkout, orders);
      if (
        existing &&
        (existing.status === 'READY' ||
          (existing.status === 'FETCHING' &&
            now.getTime() - new Date(existing.quotedAt).getTime() < 10000))
      )
        return { cached: existing };
      const row = manager.create(CheckoutShippingQuote, {
        checkoutId,
        fingerprint: context.fingerprint,
        inputs: context.inputs,
      });
      row.id = randomUUID();
      row.result = {
        id: row.id,
        status: 'FETCHING',
        environment: 'SANDBOX',
        carrier: 'GHN',
        parcelMethod: 'BOUNDING_STACK_V1',
        quotedAt: now.toISOString(),
        expiresAt: new Date(
          Math.min(now.getTime() + 120000, checkout.expiresAt.getTime()),
        ).toISOString(),
        orders: context.results,
        totalShippingFee: null,
        grandTotal: null,
        currency: 'VND',
        paymentReady: false,
      };
      await manager.save(row);
      checkout.activeShippingQuoteId = row.id;
      await manager.save(checkout);
      return { row };
    });
    if (prepared.cached) return prepared.cached;
    const row = prepared.row!;
    const signal = AbortSignal.timeout(8000);
    let next = 0;
    // Bounded concurrency and a shared total budget; no DB locks during HTTP.
    await Promise.all(
      Array.from(
        { length: Math.min(4, row.result.orders.length) },
        async () => {
          while (next < row.result.orders.length) {
            const index = next++;
            const order = row.result.orders[index];
            if (order.reason) continue;
            try {
              const input = row.inputs[index].input;
              if (!input) throw new Error('PICKUP_REQUIRED');
              const response = await this.carrier.quote(input, signal);
              order.status = 'QUOTED';
              order.fee = response.fee;
              order.estimatedDeliveryAt = response.estimatedDeliveryAt;
            } catch (error) {
              const reason = quoteReasonSchema.safeParse(
                error instanceof Error ? error.message : '',
              );
              order.reason = reason.success
                ? reason.data
                : 'CARRIER_UNAVAILABLE';
            }
          }
        },
      ),
    );
    const quoted = row.result.orders.filter(
      (order) => order.status === 'QUOTED',
    );
    row.result.status =
      quoted.length === row.result.orders.length
        ? 'READY'
        : quoted.length
          ? 'PARTIAL'
          : 'UNAVAILABLE';
    if (row.result.status === 'READY') {
      row.result.totalShippingFee = quoted.reduce(
        (sum, order) => sum + order.fee!,
        0,
      );
    }
    return this.db.transaction(async (manager) => {
      const checkout = await manager.findOne(Checkout, {
        where: { id: checkoutId, buyerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!checkout) throw new NotFoundException('Checkout not found');
      const orders = await manager.find(CheckoutOrder, {
        where: { checkoutId },
        order: { id: 'ASC' },
      });
      const now = await databaseNow(manager);
      if (
        checkout.activeShippingQuoteId !== row.id ||
        checkout.status !== 'HELD' ||
        !checkout.expiresAt ||
        checkout.expiresAt <= now ||
        new Date(row.result.expiresAt) <= now
      ) {
        row.result = invalidateQuote(
          row.result,
          checkout.expiresAt && checkout.expiresAt <= now
            ? 'EXPIRED'
            : 'INVALIDATED',
        );
      } else if (
        (await quoteInputs(manager, checkout, orders)).fingerprint !==
        row.fingerprint
      )
        row.result = invalidateQuote(row.result, 'INVALIDATED');
      if (row.result.status === 'READY')
        row.result.grandTotal =
          orders.reduce((sum, order) => sum + order.subtotal, 0) +
          row.result.totalShippingFee!;
      await manager.save(CheckoutShippingQuote, row);
      return row.result;
    });
  }
}
