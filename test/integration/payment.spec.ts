import { randomUUID } from 'node:crypto';

import { EntityNotFoundError } from 'typeorm';

import { MomoSandboxClient } from '@/infrastructure/payment/momo-sandbox.client';
import { GhnSandboxAdapter } from '@/infrastructure/shipping/ghn-sandbox.adapter';
import { Category } from '@/modules/category/entities';
import { CheckoutOrder } from '@/modules/checkout/entities/checkout-order.entity';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { ShippingQuoteService } from '@/modules/checkout/shipping-quote.service';
import { MarketplaceFactory } from '@/modules/database/seeds/factories/marketplace.factory';
import { OrderAccess } from '@/modules/order/order.access';
import { Order } from '@/modules/order/order.entity';
import { OrderService } from '@/modules/order/order.service';
import {
  PaymentAttempt,
  PaymentRefund,
} from '@/modules/payment/payment.entity';
import { PaymentPricing } from '@/modules/payment/payment.pricing';
import { PaymentService } from '@/modules/payment/payment.service';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { WalletService } from '@/modules/wallet/wallet.service';

import { createTestDatabase } from '../support/database';
import type { TestDatabase } from '../support/database';

describe('MoMo checkout settlement (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: PaymentService;
  const client = { create: jest.fn(), query: jest.fn(), verifyIpn: jest.fn() };
  const carrier = { quote: jest.fn() };
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new PaymentService(
      database.dataSource,
      client as unknown as MomoSandboxClient,
      new PaymentPricing(
        new ShippingQuoteService(
          database.dataSource,
          carrier as unknown as GhnSandboxAdapter,
        ),
      ),
    );
  });
  afterAll(async () => {
    await database?.destroy();
  });

  async function fixture() {
    const db = database.dataSource;
    const factory = new MarketplaceFactory(randomUUID());
    const buyer = await db.getRepository(User).save(factory.user(1, 'unused'));
    const category = await db.getRepository(Category).save(factory.category(0));
    const shop = await db.getRepository(Shop).save(factory.shop(0));
    const product = await db
      .getRepository(Product)
      .save(
        factory.product(
          0,
          { categoryId: category.id, shopId: shop.id },
          { status: ProductStatus.ACTIVE },
        ),
      );
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
    const checkout = await db.getRepository(Checkout).save({
      buyerId: buyer.id,
      requestId: randomUUID(),
      addressId: randomUUID(),
      requestedProductIds: [product.id],
      address,
      status: 'HELD',
      expiresAt: new Date(Date.now() + 600000),
      holdSeconds: 600,
      removedItems: [],
    });
    await db.getRepository(Product).update(product.id, {
      status: ProductStatus.HELD,
      reservationId: checkout.id,
      heldUntil: checkout.expiresAt,
    });
    await db.getRepository(PickupLocation).save({
      shopId: shop.id,
      contactName: 'Shop owner',
      phone: address.phone,
      addressLine1: 'Pickup',
      countryCode: 'VN',
      provinceCode: '79',
      provinceName: 'HCM',
      wardCode: '1',
      wardName: 'Ward',
    });
    await db.getRepository(CheckoutOrder).save({
      checkoutId: checkout.id,
      shopId: shop.id,
      subtotal: 200000,
      shippingFee: 30000,
      address,
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
    carrier.quote.mockReset();
    carrier.quote.mockResolvedValue({ fee: 30000, estimatedDeliveryAt: null });
    client.create.mockImplementation(
      async (input: {
        orderId: string;
        requestId: string;
        amount: number;
      }) => ({
        ...input,
        resultCode: 0,
        payUrl: 'https://test-payment.momo.vn/pay',
      }),
    );
    client.verifyIpn.mockImplementation((value) => value);
    return { db, buyer, product, checkout, shop };
  }

  it('charges only server total and concurrent duplicate IPNs create one order and consume stock once', async () => {
    const { db, buyer, product, checkout } = await fixture();
    const requestId = randomUUID();
    const payment = await service.create(buyer.id, checkout.id, requestId);
    expect(payment.amount).toBe(230000);
    expect((await service.create(buyer.id, checkout.id, requestId)).id).toBe(
      payment.id,
    );
    const notification = {
      partnerCode: 'TEST',
      orderId: payment.id,
      requestId: payment.id,
      amount: 230000,
      transId: 123456,
      resultCode: 0,
      orderInfo: `Rewear ${checkout.id}`,
      orderType: 'momo_wallet',
      message: '',
      payType: 'qr',
      responseTime: Date.now(),
      extraData: '',
      signature: 'test',
    };
    await Promise.all([service.ipn(notification), service.ipn(notification)]);
    expect(
      await db.getRepository(Order).countBy({ paymentId: payment.id }),
    ).toBe(1);
    expect(
      (await db.getRepository(Product).findOneByOrFail({ id: product.id }))
        .status,
    ).toBe(ProductStatus.SOLD);
    expect(
      (await db.getRepository(Checkout).findOneByOrFail({ id: checkout.id }))
        .status,
    ).toBe('PAID');
    const savedOrder = await db
      .getRepository(Order)
      .findOneByOrFail({ paymentId: payment.id });
    expect(
      (await db.getRepository(Product).findOneByOrFail({ id: product.id }))
        .soldOrderId,
    ).toBe(savedOrder.id);
    expect(
      (
        await db.getRepository(Order).findOneByOrFail({ paymentId: payment.id })
      ).sellerConfirmBy.getTime(),
    ).toBeGreaterThan(Date.now() + 86300000);
  });

  it('late success creates a refund obligation and never revives checkout or consumes released stock', async () => {
    const { db, buyer, product, checkout } = await fixture();
    const payment = await service.create(buyer.id, checkout.id, randomUUID());
    await db
      .getRepository(Checkout)
      .update(checkout.id, { status: 'CANCELLED' });
    await db.getRepository(Product).update(product.id, {
      status: ProductStatus.ACTIVE,
      reservationId: null,
      heldUntil: null,
    });
    await service.applyResult(payment.id, {
      partnerCode: 'TEST',
      orderId: payment.id,
      requestId: payment.id,
      amount: 230000,
      transId: 222222,
      resultCode: 0,
    });
    expect(
      await db.getRepository(Order).countBy({ paymentId: payment.id }),
    ).toBe(0);
    expect(
      await db.getRepository(PaymentRefund).countBy({ paymentId: payment.id }),
    ).toBe(1);
    expect(
      (await db.getRepository(Product).findOneByOrFail({ id: product.id }))
        .status,
    ).toBe(ProductStatus.ACTIVE);
  });

  it('wrong amount queues actual captured amount for refund, unknown blocks retries and strangers cannot access', async () => {
    const { db, buyer, checkout } = await fixture();
    const payment = await service.create(buyer.id, checkout.id, randomUUID());
    await expect(
      service.create(buyer.id, checkout.id, randomUUID()),
    ).rejects.toThrow('Resolve the previous payment');
    await expect(
      service.findMine(randomUUID(), payment.id),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    await service.applyResult(payment.id, {
      partnerCode: 'TEST',
      orderId: payment.id,
      requestId: payment.id,
      amount: 220000,
      transId: 333333,
      resultCode: 0,
    });
    expect(
      (
        await db
          .getRepository(PaymentRefund)
          .findOneByOrFail({ paymentId: payment.id })
      ).amount,
    ).toBe(220000);
    expect(
      (
        await db
          .getRepository(PaymentAttempt)
          .findOneByOrFail({ id: payment.id })
      ).state,
    ).toBe('REFUND_REQUIRED');
    expect(
      await db.getRepository(Order).countBy({ paymentId: payment.id }),
    ).toBe(0);
  });

  it('uses freshly quoted fees and the current shop name, then replays without requiring GHN again', async () => {
    const { db, buyer, checkout, shop } = await fixture();
    await db.getRepository(Shop).update(shop.id, { name: 'Renamed Shop' });
    carrier.quote.mockResolvedValue({ fee: 35000, estimatedDeliveryAt: null });
    const requestId = randomUUID();
    const payment = await service.create(buyer.id, checkout.id, requestId);
    expect(payment.amount).toBe(235000);
    const saved = await db
      .getRepository(PaymentAttempt)
      .findOneByOrFail({ id: payment.id });
    expect(saved.orders[0].shopName).toBe('Renamed Shop');
    carrier.quote.mockRejectedValue(new Error('CARRIER_UNAVAILABLE'));
    expect((await service.create(buyer.id, checkout.id, requestId)).id).toBe(
      payment.id,
    );
  });

  it('does not create a payment when fresh shipping cannot be fully quoted', async () => {
    const { db, buyer, checkout } = await fixture();
    carrier.quote.mockRejectedValue(new Error('CARRIER_UNAVAILABLE'));
    await expect(
      service.create(buyer.id, checkout.id, randomUUID()),
    ).rejects.toThrow('Refresh the shipping quote');
    expect(
      await db
        .getRepository(PaymentAttempt)
        .countBy({ checkoutId: checkout.id }),
    ).toBe(0);
  });

  it('allows checkout cancellation during carrier HTTP and never charges the cancelled checkout', async () => {
    const { db, buyer, checkout } = await fixture();
    carrier.quote.mockImplementation(async () => {
      // Acquiring the shared lifecycle lock here would deadlock if GHN HTTP
      // were running inside the payment transaction.
      await db.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
        await manager.update(Checkout, checkout.id, { status: 'CANCELLED' });
      });
      return { fee: 30000, estimatedDeliveryAt: null };
    });
    await expect(
      service.create(buyer.id, checkout.id, randomUUID()),
    ).rejects.toThrow('An active reservation is required');
    expect(
      await db
        .getRepository(PaymentAttempt)
        .countBy({ checkoutId: checkout.id }),
    ).toBe(0);
  });

  it('never recreates an expired Shop order or refunds MoMo again when its successful capture is replayed', async () => {
    const { db, buyer, checkout, product } = await fixture();
    const payment = await service.create(buyer.id, checkout.id, randomUUID());
    const capture = {
      partnerCode: 'TEST',
      orderId: payment.id,
      requestId: payment.id,
      amount: 230000,
      transId: 777777,
      resultCode: 0,
    };
    await service.applyResult(payment.id, capture);
    const order = await db
      .getRepository(Order)
      .findOneByOrFail({ paymentId: payment.id });
    await db
      .getRepository(Order)
      .update(order.id, { sellerConfirmBy: new Date(Date.now() - 1) });
    const orders = new OrderService(
      db,
      new OrderAccess(),
      new WalletService(db),
    );
    await orders.expireDue();
    await service.applyResult(payment.id, capture);
    expect(
      await db.getRepository(Order).countBy({ paymentId: payment.id }),
    ).toBe(1);
    expect(
      (await db.getRepository(Order).findOneByOrFail({ id: order.id })).status,
    ).toBe('cancelled');
    expect(
      await db.getRepository(PaymentRefund).countBy({ paymentId: payment.id }),
    ).toBe(0);
    expect(
      (await db.getRepository(Product).findOneByOrFail({ id: product.id }))
        .status,
    ).toBe(ProductStatus.ACTIVE);
    expect((await new WalletService(db).mine(buyer.id, {})).balance).toBe(
      230000,
    );
  });
});
