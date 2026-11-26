import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { MONEY_CURRENCY } from '@/common/constants/money.constant';
import { aggregateParcel } from '@/common/schemas/shipping-package.schema';
import {
  type CarrierQuoteInput,
  GhnSandboxAdapter,
} from '@/infrastructure/shipping/adapters/ghn-sandbox.adapter';
import { GHN_SHIPPING_LIMITS } from '@/infrastructure/shipping/constants/ghn-shipment.constant';
import { CoinService } from '@/modules/coins/core/coin.service';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';

import { pruneIdentityCheckout } from './checkout.service';
import { CHECKOUT_STATUS } from './constants/checkout.constant';
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
import {
  type QuoteOrder,
  quoteReasonSchema,
  type ShippingQuoteResult,
} from './schemas/shipping-quote.schema';

export async function quoteInputs(
  manager: EntityManager,
  orders: CheckoutOrder[],
) {
  const shopIds = [...new Set(orders.map((order) => order.shopId))];
  const pickups = shopIds.length
    ? await manager.find(PickupLocation, {
        where: { shopId: In(shopIds) },
      })
    : [];
  const pickupByShop = new Map(pickups.map((p) => [p.shopId, p]));
  const inputs: (CarrierQuoteInput | null)[] = [];
  const results: QuoteOrder[] = [];

  for (const order of orders) {
    const pickup = pickupByShop.get(order.shopId);
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
    if (
      !row.reason &&
      (!pickup || pickup.ghnSyncStatus !== 'CONNECTED' || !pickup.ghnShopId)
    ) {
      row.reason = SHIPPING_QUOTE_REASON.PICKUP_REQUIRED;
    }
    if (
      !row.reason &&
      order.subtotal > GHN_SHIPPING_LIMITS.MAX_DECLARED_VALUE
    ) {
      row.reason = SHIPPING_QUOTE_REASON.DECLARED_VALUE_LIMIT;
    }
    inputs.push(
      pickup && row.parcel
        ? {
            ghnShopId: pickup.ghnShopId ?? undefined,
            from: {
              name: pickup.contactName,
              phone: pickup.phone,
              addressLine1: pickup.addressLine1,
              countryCode: pickup.countryCode,
              provinceId: pickup.provinceId,
              provinceName: pickup.provinceName,
              districtId: pickup.districtId,
              districtName: pickup.districtName,
              wardCode: pickup.wardCode,
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
              provinceId: order.address.provinceId,
              provinceName: order.address.provinceName,
              districtId: order.address.districtId,
              districtName: order.address.districtName,
              wardCode: order.address.wardCode,
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

@Injectable()
export class ShippingQuoteService {
  constructor(
    private readonly db: DataSource,
    private readonly carrier: GhnSandboxAdapter,
    private readonly coinService: CoinService,
  ) {}

  async refresh(
    buyerId: string,
    checkoutId: string,
  ): Promise<ShippingQuoteResult> {
    const { checkout, now } = await this.db.transaction(async (manager) => {
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const currentNow = new Date(clock);
      const row = await manager.findOneOrFail(Checkout, {
        where: { id: checkoutId, buyerId },
        lock: { mode: 'pessimistic_write' },
      });
      await pruneIdentityCheckout(manager, row, currentNow, this.coinService);
      return { checkout: row, now: currentNow };
    });
    this.assertActive(checkout, now);

    const orders = await this.db.getRepository(CheckoutOrder).find({
      where: { checkoutId },
      order: { id: 'ASC' },
    });
    const { inputs, results } = await quoteInputs(this.db.manager, orders);
    await this.quoteOrders(inputs, results);

    const [currentCheckout, [{ now: afterClock }]] = await Promise.all([
      this.db.getRepository(Checkout).findOneByOrFail({
        id: checkoutId,
        buyerId,
      }),
      this.db.query('SELECT clock_timestamp() AS now'),
    ]);
    this.assertActive(currentCheckout, new Date(afterClock));

    const quoted = results.filter(
      (order) => order.status === SHIPPING_QUOTE_ORDER_STATUS.QUOTED,
    );
    const status =
      quoted.length === results.length
        ? SHIPPING_QUOTE_STATUS.READY
        : quoted.length
          ? SHIPPING_QUOTE_STATUS.PARTIAL
          : SHIPPING_QUOTE_STATUS.UNAVAILABLE;
    if (
      currentCheckout.identityReviewRequired &&
      status === SHIPPING_QUOTE_STATUS.READY
    ) {
      await this.db
        .getRepository(Checkout)
        .update(
          { id: checkoutId, buyerId, status: CHECKOUT_STATUS.HELD },
          { identityReviewRequired: false },
        );
      currentCheckout.identityReviewRequired = false;
    }
    const totalShippingFee =
      status === SHIPPING_QUOTE_STATUS.READY
        ? quoted.reduce((sum, order) => sum + order.fee!, 0)
        : null;
    return {
      identityReviewRequired: !!currentCheckout.identityReviewRequired,
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

  private async quoteOrders(
    inputs: (CarrierQuoteInput | null)[],
    results: QuoteOrder[],
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

  private assertActive(checkout: Checkout, now: Date) {
    const reservationIsInactive =
      checkout.status !== CHECKOUT_STATUS.HELD ||
      !checkout.expiresAt ||
      checkout.expiresAt <= now;
    if (reservationIsInactive) {
      throw new ConflictException('An active reservation is required');
    }
  }
}
