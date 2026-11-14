import { randomUUID } from 'node:crypto';

import { MomoSandboxClient } from '@/infrastructure/payment/momo-sandbox.client';
import { GhnSandboxAdapter } from '@/infrastructure/shipping/ghn-sandbox.adapter';
import { CartService } from '@/modules/cart/cart.service';
import { Category } from '@/modules/category/entities';
import { CheckoutService } from '@/modules/checkout/checkout.service';
import { CheckoutOrder } from '@/modules/checkout/entities/checkout-order.entity';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { ShippingQuoteService } from '@/modules/checkout/shipping-quote.service';
import { CodPolicy } from '@/modules/cod/cod.policy';
import { CodService } from '@/modules/cod/cod.service';
import { MarketplaceFactory } from '@/modules/database/seeds/factories/marketplace.factory';
import { OrderAccess } from '@/modules/order/order.access';
import { Order } from '@/modules/order/order.entity';
import { OrderService } from '@/modules/order/order.service';
import { PaymentAttempt } from '@/modules/payment/payment.entity';
import { PaymentRefund } from '@/modules/payment/payment.entity';
import { PaymentPricing } from '@/modules/payment/payment.pricing';
import { PaymentService } from '@/modules/payment/payment.service';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { WalletService } from '@/modules/wallet/wallet.service';

import { createTestDatabase } from '../support/database';
import type { TestDatabase } from '../support/database';

describe('COD placement and reservations (PostgreSQL)', () => {
  let database: TestDatabase;
  let cod: CodService;
  let orders: OrderService;
  const carrier = {
    quote: jest
      .fn()
      .mockResolvedValue({ fee: 30000, estimatedDeliveryAt: null }),
  };
  beforeAll(async () => {
    database = await createTestDatabase();
    const db = database.dataSource;
    const policy = new CodPolicy(db);
    const pricing = new PaymentPricing(
      new ShippingQuoteService(db, carrier as unknown as GhnSandboxAdapter),
    );
    cod = new CodService(db, pricing, policy);
    orders = new OrderService(
      db,
      new OrderAccess(),
      new WalletService(db),
      policy,
    );
  });
  afterAll(async () => database?.destroy());

  async function fixture(existingBuyer?: User) {
    const db = database.dataSource;
    const factory = new MarketplaceFactory(randomUUID());
    const buyer =
      existingBuyer ??
      (await db.getRepository(User).save(factory.user(0, 'unused')));
    const owner = await db.getRepository(User).save(factory.user(1, 'unused'));
    const shop = await db.getRepository(Shop).save(factory.shop(0));
    await db
      .getRepository(ShopMember)
      .save(factory.shopMember(0, shop.id, owner.id));
    const category = await db.getRepository(Category).save(factory.category(0));
    const product = await db
      .getRepository(Product)
      .save(factory.product(0, { shopId: shop.id, categoryId: category.id }));
    const address = {
      recipientName: 'Buyer',
      phone: '0912345678',
      addressLine1: 'Test',
      addressLine2: null,
      countryCode: 'VN',
      provinceCode: '79',
      provinceName: 'HCM',
      wardCode: '1',
      wardName: 'Ward',
      postalCode: null,
      deliveryInstructions: null,
    };
    await db.getRepository(PickupLocation).save({
      shopId: shop.id,
      contactName: 'Shop',
      phone: address.phone,
      addressLine1: 'Pickup',
      countryCode: 'VN',
      provinceCode: '79',
      provinceName: 'HCM',
      wardCode: '1',
      wardName: 'Ward',
    });
    const checkout = await db.getRepository(Checkout).save({
      buyerId: buyer.id,
      requestId: randomUUID(),
      addressId: randomUUID(),
      requestedProductIds: [product.id],
      address,
      status: 'HELD',
      expiresAt: new Date(Date.now() + 600000),
      removedItems: [],
    });
    await db.getRepository(Product).update(product.id, {
      status: ProductStatus.HELD,
      reservationId: checkout.id,
      heldUntil: checkout.expiresAt,
    });
    await db.getRepository(CheckoutOrder).save({
      checkoutId: checkout.id,
      shopId: shop.id,
      address,
      subtotal: 200000,
      shippingFee: null,
      items: [
        {
          productId: product.id,
          title: 'Jacket',
          price: 200000,
          revision: 1,
          size: null,
          condition: 'GOOD',
          coverUrl: null,
          shippingPackage: {
            weightGrams: 500,
            lengthCm: 30,
            widthCm: 20,
            heightCm: 5,
          },
        },
      ],
    });
    return { db, buyer, owner, shop, product, checkout };
  }

  it('places one COD order once, keeps stock locked beyond checkout expiry and never credits unpaid money', async () => {
    const f = await fixture();
    const [first, repeat] = await Promise.all([
      cod.place(f.buyer.id, f.checkout.id, 230000),
      cod.place(f.buyer.id, f.checkout.id, 230000),
    ]);
    expect(first[0].id).toBe(repeat[0].id);
    expect(first[0].paymentMethod).toBe('COD');
    expect(first[0].paymentId).toBeNull();
    expect(first[0].total).toBe(230000);
    await f.db
      .getRepository(Checkout)
      .update(f.checkout.id, { expiresAt: new Date(Date.now() - 1) });
    await new CheckoutService(f.db, {} as CartService).expire();
    expect(
      (await f.db.getRepository(Product).findOneByOrFail({ id: f.product.id }))
        .reservedOrderId,
    ).toBe(first[0].id);
    await orders.reject(f.owner.id, f.shop.id, first[0].id, 'Cannot fulfil');
    expect((await new WalletService(f.db).mine(f.buyer.id, {})).balance).toBe(
      0,
    );
    expect(
      (await f.db.getRepository(Product).findOneByOrFail({ id: f.product.id }))
        .status,
    ).toBe(ProductStatus.ACTIVE);
  });

  it('replays the committed COD order when an overlapping shipping quote finishes after placement', async () => {
    const f = await fixture();
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    let started!: () => void;
    const bothQuoting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const response = { fee: 30000, estimatedDeliveryAt: null };
    carrier.quote.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirst = () => resolve(response);
        }),
    );
    carrier.quote.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSecond = () => resolve(response);
          started();
        }),
    );
    const first = cod.place(f.buyer.id, f.checkout.id, 230000);
    const second = cod.place(f.buyer.id, f.checkout.id, 230000);
    await bothQuoting;
    releaseFirst();
    const placed = await Promise.race([first, second]);
    releaseSecond();
    const results = await Promise.all([first, second]);
    expect(results.map((orders) => orders[0].id)).toEqual([
      placed[0].id,
      placed[0].id,
    ]);
    expect(
      await f.db.getRepository(Order).countBy({ checkoutId: f.checkout.id }),
    ).toBe(1);
  });

  it('blocks a fourth pending checkout without changing existing stock or orders', async () => {
    const first = await fixture();
    await cod.place(first.buyer.id, first.checkout.id, 230000);
    for (let i = 0; i < 2; i++) {
      const f = await fixture(first.buyer);
      await cod.place(f.buyer.id, f.checkout.id, 230000);
    }
    const fourth = await fixture(first.buyer);
    await expect(
      cod.place(fourth.buyer.id, fourth.checkout.id, 230000),
    ).rejects.toThrow('COD limit reached');
    expect(
      await first.db
        .getRepository(Order)
        .countBy({ buyerId: first.buyer.id, paymentMethod: 'COD' }),
    ).toBe(3);
    expect(
      (
        await first.db
          .getRepository(Product)
          .findOneByOrFail({ id: fourth.product.id })
      ).reservationId,
    ).toBe(fourth.checkout.id);
  });

  it('blocks COD while an earlier MoMo attempt is unresolved', async () => {
    const f = await fixture();
    await f.db.getRepository(PaymentAttempt).save({
      checkoutId: f.checkout.id,
      buyerId: f.buyer.id,
      requestId: randomUUID(),
      amount: 230000,
      orders: [],
      state: 'UNKNOWN',
      nextQueryAt: new Date(),
    });
    await expect(cod.place(f.buyer.id, f.checkout.id, 230000)).rejects.toThrow(
      'Resolve the previous payment',
    );
    expect(
      await f.db.getRepository(Order).countBy({ checkoutId: f.checkout.id }),
    ).toBe(0);
  });

  it('permits twenty pending items and refuses a twenty-first without changing the new checkout', async () => {
    const f = await fixture();
    const source = await f.db
      .getRepository(CheckoutOrder)
      .findOneByOrFail({ checkoutId: f.checkout.id });
    const factory = new MarketplaceFactory(randomUUID());
    const extras = await f.db.getRepository(Product).save(
      Array.from({ length: 19 }, (_, index) =>
        factory.product(
          index,
          { shopId: f.shop.id, categoryId: f.product.categoryId! },
          {
            status: ProductStatus.HELD,
            reservationId: f.checkout.id,
            heldUntil: f.checkout.expiresAt,
          },
        ),
      ),
    );
    source.items = [f.product, ...extras].map((product) => ({
      ...source.items[0],
      productId: product.id,
    }));
    source.subtotal = 4000000;
    await f.db.getRepository(CheckoutOrder).save(source);
    await f.db.getRepository(Checkout).update(f.checkout.id, {
      requestedProductIds: source.items.map((item) => item.productId),
    });
    const placed = await cod.place(f.buyer.id, f.checkout.id, 4030000);
    expect(placed[0].items).toHaveLength(20);
    const next = await fixture(f.buyer);
    await expect(
      cod.place(f.buyer.id, next.checkout.id, 230000),
    ).rejects.toThrow('COD limit reached');
    expect(
      await f.db.getRepository(Order).countBy({ checkoutId: next.checkout.id }),
    ).toBe(0);
  });

  it('limits active COD checkouts to five after pending orders have been accepted', async () => {
    const first = await fixture();
    for (let i = 0; i < 5; i++) {
      const f = i === 0 ? first : await fixture(first.buyer);
      const [order] = await cod.place(f.buyer.id, f.checkout.id, 230000);
      await orders.accept(f.owner.id, f.shop.id, order.id);
    }
    const next = await fixture(first.buyer);
    await expect(
      cod.place(first.buyer.id, next.checkout.id, 230000),
    ).rejects.toThrow('COD limit reached');
  });

  it('refunds late MoMo capture after switching a failed attempt to COD without touching COD stock', async () => {
    const f = await fixture();
    const pricing = new PaymentPricing(
      new ShippingQuoteService(f.db, carrier as unknown as GhnSandboxAdapter),
    );
    const gateway = {
      create: async () => ({ resultCode: 1006 }),
    } as unknown as MomoSandboxClient;
    const payments = new PaymentService(f.db, gateway, pricing);
    const failed = await payments.create(
      f.buyer.id,
      f.checkout.id,
      randomUUID(),
    );
    expect(failed.state).toBe('FAILED');
    const [order] = await cod.place(f.buyer.id, f.checkout.id, 230000);
    await payments.applyResult(failed.id, {
      partnerCode: 'TEST',
      orderId: failed.id,
      requestId: failed.id,
      amount: 230000,
      transId: 987654321,
      resultCode: 0,
    });
    expect(
      await f.db.getRepository(PaymentRefund).countBy({ paymentId: failed.id }),
    ).toBe(1);
    expect(
      (await f.db.getRepository(Product).findOneByOrFail({ id: f.product.id }))
        .reservedOrderId,
    ).toBe(order.id);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: order.id }))
        .status,
    ).toBe('pending');
    expect((await new WalletService(f.db).mine(f.buyer.id, {})).balance).toBe(
      0,
    );
  });

  it('serializes buyer cancellation and seller acceptance with no refund and no double stock release', async () => {
    const f = await fixture();
    const [order] = await cod.place(f.buyer.id, f.checkout.id, 230000);
    const result = await Promise.allSettled([
      orders.cancelCodPending(f.buyer.id, order.id),
      orders.accept(f.owner.id, f.shop.id, order.id),
    ]);
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect((await new WalletService(f.db).mine(f.buyer.id, {})).balance).toBe(
      0,
    );
  });

  it('counts self-cancelled checkouts once and restricts new COD after five while allowing old-order reads', async () => {
    const first = await fixture();
    for (let i = 0; i < 5; i++) {
      const f = i === 0 ? first : await fixture(first.buyer);
      const [order] = await cod.place(f.buyer.id, f.checkout.id, 230000);
      await orders.cancelCodPending(f.buyer.id, order.id);
      await orders.cancelCodPending(f.buyer.id, order.id);
    }
    const next = await fixture(first.buyer);
    await expect(
      cod.place(first.buyer.id, next.checkout.id, 230000),
    ).rejects.toThrow('COD is temporarily restricted');
    expect(await orders.buyerList(first.buyer.id, {})).toHaveLength(5);
  });
});
