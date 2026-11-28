import { randomUUID } from 'node:crypto';

import { pruneIdentityCheckout } from '@/modules/checkout/checkout.service';
import { CheckoutOrder } from '@/modules/checkout/entities/checkout-order.entity';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import type { ShippingQuoteResult } from '@/modules/checkout/schemas/shipping-quote.schema';
import { ShippingQuoteService } from '@/modules/checkout/shipping-quote.service';
import { CoinService } from '@/modules/coins/coin.service';
import { PaymentAttempt } from '@/modules/payment/entities';
import { PaymentPricing } from '@/modules/payment/payment.pricing';
import { Product } from '@/modules/product/entities';
import { ProductCondition, ProductStatus } from '@/modules/product/enums';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { Shop } from '@/modules/shop/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Identity restricted checkout (PostgreSQL)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => database?.destroy());
  async function fixture() {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const other = await db.getRepository(Shop).save({ name: 'Allowed shop' });
    await db.getRepository(PickupLocation).save({
      shopId: other.id,
      contactName: 'Seller',
      phone: '0901234567',
      addressLine1: '123 Street',
      provinceId: 202,
      provinceName: 'HCM',
      districtId: 1442,
      districtName: 'District 1',
      wardCode: '20101',
      wardName: 'Ward 1',
      ghnShopId: Math.floor(Math.random() * 900_000_000) + 10_000,
      ghnSyncStatus: 'CONNECTED',
    });
    const address = {
      recipientName: 'Buyer',
      phone: '0909999999',
      addressLine1: '456 Buyer St',
      addressLine2: null,
      countryCode: 'VN',
      provinceId: 202,
      provinceName: 'HCM',
      districtId: 1442,
      districtName: 'District 1',
      wardCode: '20101',
      wardName: 'Ward 1',
      postalCode: null,
      deliveryInstructions: null,
    };
    const checkout = await db.getRepository(Checkout).save({
      buyerId: f.buyer.id,
      requestId: randomUUID(),
      addressId: randomUUID(),
      requestedProductIds: [],
      address,
      status: 'HELD',
      expiresAt: new Date(Date.now() + 600000),
      removedItems: [],
    });
    const orders = [];
    const products = [];
    for (const shop of [f.shop, other]) {
      const product = await db.getRepository(Product).save({
        shopId: shop.id,
        title: 'Visible item',
        price: 100000,
        condition: ProductCondition.GOOD,
        status: ProductStatus.HELD,
        reservationId: checkout.id,
        heldUntil: checkout.expiresAt,
      });
      products.push(product);
      orders.push(
        await db.getRepository(CheckoutOrder).save({
          checkoutId: checkout.id,
          shopId: shop.id,
          address,
          items: [
            {
              productId: product.id,
              title: 'Visible item',
              price: 100000,
              condition: 'GOOD',
              size: null,
              coverUrl: null,
              shippingPackage: {
                weightGrams: 500,
                lengthCm: 30,
                widthCm: 20,
                heightCm: 5,
              },
            },
          ],
          subtotal: 100000,
        }),
      );
    }
    await db
      .getRepository(Shop)
      .update(f.shop.id, { identityManualRestriction: true });
    return { ...f, other, checkout, orders, products };
  }
  async function prune(id: string) {
    return database.dataSource.transaction(async (manager) => {
      const checkout = await manager.findOneOrFail(Checkout, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      await pruneIdentityCheckout(
        manager,
        checkout,
        new Date(),
        new CoinService(database.dataSource),
      );
      return checkout;
    });
  }
  it('prunes only the restricted Shop, releases its stock, preserves expiry and clears review on quote refresh', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const result = await prune(f.checkout.id);
    expect(result.identityReviewRequired).toBe(true);
    expect(result.expiresAt).toEqual(f.checkout.expiresAt);
    expect(result.removedItems).toEqual([
      { productId: f.products[0].id, reason: 'IDENTITY_RESTRICTED' },
    ]);
    const remaining = await db
      .getRepository(CheckoutOrder)
      .findBy({ checkoutId: result.id });
    expect(remaining.map((r) => r.id)).toEqual([f.orders[1].id]);
    expect(
      (
        await db
          .getRepository(Product)
          .findOneByOrFail({ id: f.products[0].id })
      ).status,
    ).toBe(ProductStatus.ACTIVE);
    expect(
      (
        await db
          .getRepository(Product)
          .findOneByOrFail({ id: f.products[1].id })
      ).status,
    ).toBe(ProductStatus.HELD);
    await prune(result.id);
    expect(
      (await db.getRepository(Checkout).findOneByOrFail({ id: result.id }))
        .removedItems,
    ).toHaveLength(1);
    const quote = {
      status: 'READY',
      quotedAt: new Date().toISOString(),
      orders: [
        {
          orderId: remaining[0].id,
          shopId: f.other.id,
          status: 'QUOTED',
          fee: 25000,
        },
      ],
      grandTotal: 125000,
    } as ShippingQuoteResult;
    const pricing = new PaymentPricing({} as ShippingQuoteService);
    await expect(
      pricing.snapshot(db.manager, result, { checkoutId: result.id, quote }),
    ).rejects.toThrow('Refresh');
    const shipping = new ShippingQuoteService(
      db,
      {
        quote: async () => ({
          fee: 25000,
          estimatedDeliveryAt: new Date().toISOString(),
        }),
      } as never,
      new CoinService(db),
    );
    const refreshed = await shipping.refresh(f.buyer.id, result.id);
    expect(refreshed.identityReviewRequired).toBe(false);
    const confirmed = await db
      .getRepository(Checkout)
      .findOneByOrFail({ id: result.id });
    expect(confirmed.identityReviewRequired).toBe(false);
    expect(
      await pricing.snapshot(db.manager, confirmed, {
        checkoutId: result.id,
        quote: refreshed,
      }),
    ).toHaveLength(1);
    await db
      .getRepository(Shop)
      .update(f.shop.id, { identityManualRestriction: false });
    await prune(result.id);
    expect(
      await db.getRepository(CheckoutOrder).countBy({ checkoutId: result.id }),
    ).toBe(1);
  });
  it('does not change an UNKNOWN provider amount, stock or Shop allocation', async () => {
    const f = await fixture();
    const db = database.dataSource;
    await db.getRepository(PaymentAttempt).save({
      checkoutId: f.checkout.id,
      buyerId: f.buyer.id,
      requestId: randomUUID(),
      amount: 250000,
      orders: [],
      state: 'UNKNOWN',
      nextQueryAt: new Date(),
    });
    const result = await prune(f.checkout.id);
    expect(result.identityReviewRequired).toBe(true);
    expect(result.removedItems).toEqual([]);
    expect(
      await db.getRepository(CheckoutOrder).countBy({ checkoutId: result.id }),
    ).toBe(2);
    expect(
      (
        await db
          .getRepository(Product)
          .findOneByOrFail({ id: f.products[0].id })
      ).status,
    ).toBe(ProductStatus.HELD);
  });
  it('all restricted Shops yield EMPTY without extending the reservation', async () => {
    const f = await fixture();
    const db = database.dataSource;
    await db
      .getRepository(Shop)
      .update(f.other.id, { identityManualRestriction: true });
    const result = await prune(f.checkout.id);
    expect(result.status).toBe('EMPTY');
    expect(result.identityReviewRequired).toBe(false);
    expect(result.expiresAt).toEqual(f.checkout.expiresAt);
  });
});
