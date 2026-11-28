import { randomUUID } from 'node:crypto';

import { EntityNotFoundError } from 'typeorm';

import { CategoryFactory } from '@/database/factories/category.factory';
import { ProductFactory } from '@/database/factories/product.factory';
import { ShopFactory } from '@/database/factories/shop.factory';
import { UserFactory } from '@/database/factories/user.factory';
import { PayosClient } from '@/infrastructure/payment/payos.client';
import { GhnSandboxAdapter } from '@/infrastructure/shipping/adapters/ghn-sandbox.adapter';
import { Category } from '@/modules/category/entities';
import { CheckoutOrder } from '@/modules/checkout/entities/checkout-order.entity';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { ShippingQuoteService } from '@/modules/checkout/shipping-quote.service';
import { CodPolicy } from '@/modules/cod/policies/cod.policy';
import { CoinService } from '@/modules/coins/coin.service';
import { OutboxService } from '@/modules/event/outbox.service';
import { Order } from '@/modules/order/entities';
import { OrderService } from '@/modules/order/order.service';
import { PaymentAttempt, PaymentRefund } from '@/modules/payment/entities';
import { PaymentPricing } from '@/modules/payment/payment.pricing';
import { PaymentService } from '@/modules/payment/payment.service';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';
import { WalletService } from '@/modules/wallet/wallet.service';

import { createTestDatabase } from '../support/database';
import type { TestDatabase } from '../support/database';

describe('PayOS checkout settlement (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: PaymentService;
  const client = {
    createPaymentLink: jest.fn(),
    getPaymentLink: jest.fn(),
    verifyWebhook: jest.fn(),
  };
  const carrier = { quote: jest.fn() };
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new PaymentService(
      database.dataSource,
      client as unknown as PayosClient,
      new PaymentPricing(
        new ShippingQuoteService(
          database.dataSource,
          carrier as unknown as GhnSandboxAdapter,
          new CoinService(database.dataSource),
        ),
      ),
      new OutboxService(),
      new CoinService(database.dataSource),
    );
  });
  afterAll(async () => {
    await database?.destroy();
  });

  async function fixture() {
    const db = database.dataSource;

    const buyer = await db.getRepository(User).save(
      new UserFactory().build({
        role: UserRole.USER,
        password: 'unused',
      }),
    );
    const category = await db
      .getRepository(Category)
      .save(new CategoryFactory().build());
    const shop = await db.getRepository(Shop).save(new ShopFactory().build());
    const product = await db.getRepository(Product).save(
      new ProductFactory().build({
        categoryId: category.id,
        shopId: shop.id,
        status: ProductStatus.ACTIVE,
      }),
    );
    await db.getRepository(ProductModeration).save({
      productId: product.id,
      status: ProductModerationStatus.APPROVED,
      version: 1,
      reason: null,
    });
    const address = {
      recipientName: 'Buyer',
      phone: '0912345678',
      addressLine1: 'Test',
      addressLine2: null,
      countryCode: 'VN',
      provinceId: 202,
      provinceName: 'HCM',
      districtId: 1442,
      districtName: 'District 1',
      wardCode: '20101',
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
      ghnShopId: Math.floor(Math.random() * 900000) + 100000,
      ghnSyncStatus: 'CONNECTED',
      shopId: shop.id,
      contactName: 'Shop owner',
      phone: address.phone,
      addressLine1: 'Pickup',
      countryCode: 'VN',
      provinceId: 202,
      provinceName: 'HCM',
      districtId: 1442,
      districtName: 'District 1',
      wardCode: '20101',
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
    client.createPaymentLink.mockImplementation(
      async (input: { orderCode: number; amount: number }) => ({
        orderCode: input.orderCode,
        paymentLinkId: 'plink-1',
        status: 'PENDING',
        checkoutUrl: 'https://pay.payos.vn/web/plink-1',
        qrCode: 'qr',
      }),
    );
    client.verifyWebhook.mockImplementation(async (value) => value);
    return { db, buyer, product, checkout, shop };
  }

  it('charges only server total and concurrent duplicate webhooks create one order and consume stock once', async () => {
    const { db, buyer, product, checkout } = await fixture();
    const requestId = randomUUID();
    const payment = await service.create(buyer.id, checkout.id, {
      requestId: requestId,
    });
    expect(payment.amount).toBe(230000);
    expect(
      (await service.create(buyer.id, checkout.id, { requestId: requestId }))
        .id,
    ).toBe(payment.id);
    const saved = await db
      .getRepository(PaymentAttempt)
      .findOneByOrFail({ id: payment.id });
    const notification = {
      orderCode: Number(saved.providerOrderCode),
      amount: 230000,
      code: '00',
      desc: 'success',
      reference: 'FT123456',
      paymentLinkId: 'plink-1',
      description: `RW ${payment.id.slice(0, 8)}`,
      isTestPing: false,
    };
    await Promise.all([
      service.webhook(notification),
      service.webhook(notification),
    ]);
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
    const payment = await service.create(buyer.id, checkout.id, {
      requestId: randomUUID(),
    });
    await db
      .getRepository(Checkout)
      .update(checkout.id, { status: 'CANCELLED' });
    await db.getRepository(Product).update(product.id, {
      status: ProductStatus.ACTIVE,
      reservationId: null,
      heldUntil: null,
    });
    const savedAttempt = await db
      .getRepository(PaymentAttempt)
      .findOneByOrFail({ id: payment.id });
    await service.applyResult(payment.id, {
      orderCode: Number(savedAttempt.providerOrderCode),
      status: 'PAID',
      amount: 230000,
      amountPaid: 222222,
      providerTransId: 'FT222222',
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
    const payment = await service.create(buyer.id, checkout.id, {
      requestId: randomUUID(),
    });
    await expect(
      service.create(buyer.id, checkout.id, { requestId: randomUUID() }),
    ).rejects.toThrow('Resolve the previous payment');
    await expect(
      service.findMine(randomUUID(), payment.id),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    const savedAttempt = await db
      .getRepository(PaymentAttempt)
      .findOneByOrFail({ id: payment.id });
    await service.applyResult(payment.id, {
      orderCode: Number(savedAttempt.providerOrderCode),
      status: 'PAID',
      amount: 230000,
      amountPaid: 220000,
      providerTransId: 'FT333333',
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
    const payment = await service.create(buyer.id, checkout.id, {
      requestId: requestId,
    });
    expect(payment.amount).toBe(235000);
    const saved = await db
      .getRepository(PaymentAttempt)
      .findOneByOrFail({ id: payment.id });
    expect(saved.orders[0].shopName).toBe('Renamed Shop');
    carrier.quote.mockRejectedValue(new Error('CARRIER_UNAVAILABLE'));
    expect(
      (await service.create(buyer.id, checkout.id, { requestId: requestId }))
        .id,
    ).toBe(payment.id);
  });

  it('does not create a payment when fresh shipping cannot be fully quoted', async () => {
    const { db, buyer, checkout } = await fixture();
    carrier.quote.mockRejectedValue(new Error('CARRIER_UNAVAILABLE'));
    await expect(
      service.create(buyer.id, checkout.id, { requestId: randomUUID() }),
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
      // Updating the checkout row here would deadlock if GHN HTTP
      // were running inside the payment transaction while Checkout is locked.
      await db.transaction(async (manager) => {
        await manager.update(Checkout, checkout.id, { status: 'CANCELLED' });
      });
      return { fee: 30000, estimatedDeliveryAt: null };
    });
    await expect(
      service.create(buyer.id, checkout.id, { requestId: randomUUID() }),
    ).rejects.toThrow('An active reservation is required');
    expect(
      await db
        .getRepository(PaymentAttempt)
        .countBy({ checkoutId: checkout.id }),
    ).toBe(0);
  });

  it('never recreates an expired Shop order or refunds PayOS again when its successful capture is replayed', async () => {
    const { db, buyer, checkout, product } = await fixture();
    const payment = await service.create(buyer.id, checkout.id, {
      requestId: randomUUID(),
    });
    const savedAttempt = await db
      .getRepository(PaymentAttempt)
      .findOneByOrFail({ id: payment.id });
    const capture = {
      orderCode: Number(savedAttempt.providerOrderCode),
      status: 'PAID' as const,
      amount: 230000,
      amountPaid: 230000,
      providerTransId: 'FT777777',
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
      new WalletService(db),
      new CodPolicy(db),
      new OutboxService(),
      new CoinService(db),
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
    expect(
      (await new WalletService(db).mine(buyer.id, {})).simulationBalance,
    ).toBe(230000);
  });
});
