import { randomUUID } from 'node:crypto';

import { CheckoutOrder } from '@/modules/checkout/entities/checkout-order.entity';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { pruneIdentityCheckout } from '@/modules/checkout/identity-checkout.policy';
import { identityQuoteFingerprint } from '@/modules/checkout/identity-quote.policy';
import { ShippingQuoteService } from '@/modules/checkout/shipping-quote.service';
import type { ShippingQuoteResult } from '@/modules/checkout/types/shipping-quote.type';
import { PaymentAttempt } from '@/modules/payment/entities/payment.entity';
import { PaymentPricing } from '@/modules/payment/payment.pricing';
import { Product } from '@/modules/product/entities';
import { ProductCondition, ProductStatus } from '@/modules/product/enums';
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
    const checkout = await db
      .getRepository(Checkout)
      .save({
        buyerId: f.buyer.id,
        requestId: randomUUID(),
        addressId: randomUUID(),
        requestedProductIds: [],
        address: {} as never,
        status: 'HELD',
        expiresAt: new Date(Date.now() + 600000),
        removedItems: [],
      });
    const orders = [];
    const products = [];
    for (const shop of [f.shop, other]) {
      const product = await db
        .getRepository(Product)
        .save({
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
        await db
          .getRepository(CheckoutOrder)
          .save({
            checkoutId: checkout.id,
            shopId: shop.id,
            address: {} as never,
            items: [
              {
                productId: product.id,
                title: 'Visible item',
                price: 100000,
                condition: 'GOOD',
                size: null,
                coverUrl: null,
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
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const checkout = await manager.findOneByOrFail(Checkout, { id });
      await pruneIdentityCheckout(manager, checkout, new Date());
      return checkout;
    });
  }
  it('prunes only the restricted Shop, releases its stock, preserves expiry and requires explicit confirmation', async () => {
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
    ).rejects.toThrow('Confirm');
    const shipping = new ShippingQuoteService(db, {} as never);
    jest
      .spyOn(shipping, 'refresh')
      .mockResolvedValue({
        ...quote,
        identityQuoteFingerprint: identityQuoteFingerprint(
          result,
          remaining,
          quote,
        ),
      });
    await shipping.confirmIdentityReview(
      f.buyer.id,
      result.id,
      identityQuoteFingerprint(result, remaining, quote),
    );
    const confirmed = await db
      .getRepository(Checkout)
      .findOneByOrFail({ id: result.id });
    expect(
      await pricing.snapshot(db.manager, confirmed, {
        checkoutId: result.id,
        quote,
      }),
    ).toHaveLength(1);
    await expect(
      pricing.snapshot(db.manager, confirmed, {
        checkoutId: result.id,
        quote: {
          ...quote,
          orders: [{ ...quote.orders[0], fee: 30000 }],
          grandTotal: 130000,
        },
      }),
    ).rejects.toThrow('Confirm');
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
    await db
      .getRepository(PaymentAttempt)
      .save({
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
