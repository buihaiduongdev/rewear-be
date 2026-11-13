import { randomUUID } from 'node:crypto';

import { EntityNotFoundError } from 'typeorm';

import { MomoSandboxClient } from '@/infrastructure/payment/momo-sandbox.client';
import { Category } from '@/modules/category/entities';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { MarketplaceFactory } from '@/modules/database/seeds/factories/marketplace.factory';
import {
  Order,
  PaymentAttempt,
  PaymentRefund,
} from '@/modules/payment/payment.entity';
import { PaymentPricing } from '@/modules/payment/payment.pricing';
import { PaymentService } from '@/modules/payment/payment.service';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';

import { createTestDatabase } from '../support/database';
import type { TestDatabase } from '../support/database';

describe('MoMo checkout settlement (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: PaymentService;
  const client = { create: jest.fn(), query: jest.fn(), verifyIpn: jest.fn() };
  const pricing = { snapshot: jest.fn() };
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new PaymentService(
      database.dataSource,
      client as unknown as MomoSandboxClient,
      pricing as unknown as PaymentPricing,
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
          { categoryId: category.id, shopId: shop.id, sellerUserId: null },
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
    pricing.snapshot.mockResolvedValue([
      {
        checkoutOrderId: randomUUID(),
        shopId: shop.id,
        shopName: shop.name,
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
            shippingPackage: null,
          },
        ],
      },
    ]);
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
    return { db, buyer, product, checkout };
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
});
