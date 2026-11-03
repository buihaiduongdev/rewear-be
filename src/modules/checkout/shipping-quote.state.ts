import { createHash } from 'node:crypto';

import { EntityManager } from 'typeorm';

import { aggregateParcel } from '@/common/schemas/shipping-package.schema';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';

import { Checkout, CheckoutOrder } from './entities/checkout.entity';
import { CheckoutShippingQuote } from './entities/shipping-quote.entity';
import type { QuoteInputSnapshot } from './entities/shipping-quote.entity';
import { quoteReasonSchema } from './schemas/shipping-quote.schema';
import type {
  QuoteOrder,
  ShippingQuoteResult,
} from './schemas/shipping-quote.schema';

export async function quoteInputs(
  manager: EntityManager,
  checkout: Checkout,
  orders: CheckoutOrder[],
) {
  const scopes = orders.map((order) =>
    order.sourceType === 'USER'
      ? { userId: order.sourceId }
      : { shopId: order.sourceId },
  );
  const pickups = scopes.length
    ? await manager.find(PickupLocation, {
        where: scopes,
        lock: { mode: 'pessimistic_read' },
      })
    : [];
  const inputs: QuoteInputSnapshot[] = [];
  const results: QuoteOrder[] = [];
  for (const order of orders) {
    const pickup = pickups.find((p) =>
      order.sourceType === 'USER'
        ? p.userId === order.sourceId
        : p.shopId === order.sourceId,
    );
    const row: QuoteOrder = {
      orderId: order.id,
      sourceType: order.sourceType,
      sourceId: order.sourceId,
      parcel: null,
      parcelCount: 1,
      itemCount: order.items.length,
      status: 'UNAVAILABLE',
      reason: null,
      fee: null,
      estimatedDeliveryAt: null,
    };
    try {
      row.parcel = aggregateParcel(
        order.items.map((item) => item.shippingPackage ?? null),
      );
    } catch (error) {
      const reason = quoteReasonSchema.safeParse(
        error instanceof Error ? error.message : '',
      );
      row.reason = reason.success ? reason.data : 'PACKAGE_REQUIRED';
    }
    if (!row.reason && !pickup) row.reason = 'PICKUP_REQUIRED';
    if (!row.reason && order.subtotal > 5000000)
      row.reason = 'DECLARED_VALUE_LIMIT';
    inputs.push({
      orderId: order.id,
      pickupId: pickup?.id ?? null,
      pickupUpdatedAt: pickup?.updatedAt.toISOString() ?? null,
      input:
        pickup && row.parcel
          ? {
              from: {
                name: pickup.contactName,
                phone: pickup.phone,
                addressLine1: pickup.addressLine1,
                countryCode: pickup.countryCode,
                provinceName: pickup.provinceName,
                wardName: pickup.wardName,
              },
              to: {
                name: order.address.recipientName,
                phone: order.address.phone,
                addressLine1: [
                  order.address.addressLine1,
                  order.address.addressLine2,
                ]
                  .filter(Boolean)
                  .join(', '),
                countryCode: order.address.countryCode,
                provinceName: order.address.provinceName,
                wardName: order.address.wardName,
              },
              parcel: row.parcel,
              value: order.subtotal,
            }
          : null,
    });
    results.push(row);
  }
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ inputs, results }))
    .digest('hex');
  return { inputs, results, fingerprint };
}
export async function databaseNow(manager: EntityManager): Promise<Date> {
  const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
  return new Date(now);
}
export function invalidateQuote(
  result: ShippingQuoteResult,
  status: 'INVALIDATED' | 'EXPIRED',
): ShippingQuoteResult {
  return {
    ...result,
    status,
    totalShippingFee: null,
    grandTotal: null,
    orders: result.orders.map((order) => ({
      ...order,
      fee: null,
      estimatedDeliveryAt: null,
    })),
  };
}
export async function effectiveShippingQuote(
  manager: EntityManager,
  checkout: Checkout,
  orders: CheckoutOrder[],
) {
  if (!checkout.activeShippingQuoteId) return null;
  const row = await manager.findOneBy(CheckoutShippingQuote, {
    id: checkout.activeShippingQuoteId,
    checkoutId: checkout.id,
  });
  if (!row) return null;
  const now = await databaseNow(manager);
  if (
    checkout.status !== 'HELD' ||
    !checkout.expiresAt ||
    checkout.expiresAt <= now
  )
    return invalidateQuote(
      row.result,
      checkout.status === 'EXPIRED' ||
        (checkout.expiresAt && checkout.expiresAt <= now)
        ? 'EXPIRED'
        : 'INVALIDATED',
    );
  if (new Date(row.result.expiresAt) <= now)
    return invalidateQuote(row.result, 'EXPIRED');
  if (
    (await quoteInputs(manager, checkout, orders)).fingerprint !==
    row.fingerprint
  )
    return invalidateQuote(row.result, 'INVALIDATED');
  return row.result;
}
