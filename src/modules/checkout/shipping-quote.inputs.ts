import { EntityManager } from 'typeorm';

import { aggregateParcel } from '@/common/schemas/shipping-package.schema';
import type { CarrierQuoteInput } from '@/infrastructure/shipping/adapters/ghn-sandbox.adapter';
import { GHN_SHIPPING_LIMITS } from '@/infrastructure/shipping/constants/ghn-shipment.constant';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';

import {
  SHIPPING_QUOTE_ORDER_STATUS,
  SHIPPING_QUOTE_REASON,
} from './constants/shipping-quote.constant';
import { CheckoutOrder } from './entities/checkout-order.entity';
import { quoteReasonSchema } from './schemas/shipping-quote.schema';
import type { QuoteOrder } from './types/shipping-quote.type';

export async function quoteInputs(
  manager: EntityManager,
  orders: CheckoutOrder[],
) {
  const scopes = orders.map((order) => ({ shopId: order.shopId }));
  const pickups = scopes.length
    ? await manager.find(PickupLocation, {
        where: scopes,
      })
    : [];
  const inputs: (CarrierQuoteInput | null)[] = [];
  const results: QuoteOrder[] = [];
  for (const order of orders) {
    const pickup = pickups.find((p) => p.shopId === order.shopId);
    const row: QuoteOrder = {
      orderId: order.id,
      shopId: order.shopId,
      parcel: null,
      parcelCount: 1,
      itemCount: order.items.length,
      status: SHIPPING_QUOTE_ORDER_STATUS.UNAVAILABLE,
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
      row.reason = reason.success
        ? reason.data
        : SHIPPING_QUOTE_REASON.PACKAGE_REQUIRED;
    }
    if (!row.reason && !pickup)
      row.reason = SHIPPING_QUOTE_REASON.PICKUP_REQUIRED;
    if (!row.reason && order.subtotal > GHN_SHIPPING_LIMITS.MAX_DECLARED_VALUE)
      row.reason = SHIPPING_QUOTE_REASON.DECLARED_VALUE_LIMIT;
    inputs.push(
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
    );
    results.push(row);
  }
  return { inputs, results };
}
