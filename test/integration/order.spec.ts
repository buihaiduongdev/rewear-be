import { randomUUID } from 'node:crypto';

import { ForbiddenException } from '@nestjs/common';

import { EntityNotFoundError } from 'typeorm';

import { CategoryFactory } from '@/database/factories/category.factory';
import { ProductFactory } from '@/database/factories/product.factory';
import { ShopMemberFactory } from '@/database/factories/shop-member.factory';
import { ShopFactory } from '@/database/factories/shop.factory';
import { UserFactory } from '@/database/factories/user.factory';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { Category } from '@/modules/category/entities';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { CodPolicy } from '@/modules/cod/policies/cod.policy';
import { Order, OrderEvent } from '@/modules/order/entities';
import { OrderService } from '@/modules/order/order.service';
import { PaymentAttempt } from '@/modules/payment/entities';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole, ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';
import { WalletService } from '@/modules/wallet/wallet.service';

import { createTestDatabase } from '../support/database';
import type { TestDatabase } from '../support/database';

describe('paid order acceptance with PostgreSQL', () => {
  let database: TestDatabase;
  let service: OrderService;
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new OrderService(
      database.dataSource,
      new WalletService(database.dataSource),
      new CodPolicy(database.dataSource),
    );
  });
  afterAll(async () => database?.destroy());

  async function fixture() {
    const db = database.dataSource;

    const [buyer, owner, stranger, staff] = await db.getRepository(User).save(
      [0, 1, 2, 3].map((index) =>
        new UserFactory().build({
          role: index === 0 ? UserRole.ADMIN : UserRole.USER,
          password: 'unused',
        }),
      ),
    );
    const category = await db
      .getRepository(Category)
      .save(new CategoryFactory().build());
    const shop = await db.getRepository(Shop).save(new ShopFactory().build());
    const membership = await db
      .getRepository(ShopMember)
      .save(
        new ShopMemberFactory().build({ shopId: shop.id, userId: owner.id }),
      );
    await db.getRepository(ShopMember).save(
      new ShopMemberFactory().build({
        shopId: shop.id,
        userId: staff.id,
        memberRole: ShopMemberRole.STAFF,
      }),
    );
    const product = await db.getRepository(Product).save(
      new ProductFactory().build({
        shopId: shop.id,
        categoryId: category.id,
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
      status: 'PAID',
      expiresAt: new Date(),
      removedItems: [],
    });
    const payment = await db.getRepository(PaymentAttempt).save({
      checkoutId: checkout.id,
      buyerId: buyer.id,
      requestId: randomUUID(),
      amount: 230000,
      orders: [],
      capturedAmount: 230000,
      providerTransId: randomUUID(),
      state: 'PAID',
      nextQueryAt: new Date(),
      paidAt: new Date(),
    });
    const order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      paymentId: payment.id,
      checkoutId: checkout.id,
      buyerId: buyer.id,
      shopId: shop.id,
      shopName: shop.name,
      status: 'pending',
      subtotal: 200000,
      shippingFee: 30000,
      total: 230000,
      address,
      items: [
        {
          productId: product.id,
          title: 'Jacket',
          price: 200000,
          size: null,
          condition: 'GOOD',
          coverUrl: null,
          shippingPackage: null,
        },
      ],
      sellerConfirmBy: new Date(Date.now() + 86400000),
    });
    Object.assign(payment, {
      orders: [
        {
          checkoutOrderId: order.checkoutOrderId,
          shopId: shop.id,
          shopName: shop.name,
          subtotal: order.subtotal,
          shippingFee: order.shippingFee,
          address: order.address,
          items: order.items,
        },
      ],
    });
    await db.getRepository(PaymentAttempt).save(payment);
    await db.getRepository(Product).update(product.id, {
      status: ProductStatus.SOLD,
      soldOrderId: order.id,
    });
    return {
      db,
      buyer,
      owner,
      stranger,
      staff,
      shop,
      membership,
      order,
      product,
      category,
      payment,
    };
  }

  it('scopes buyer/shop reads and denies other users, staff and revoked memberships', async () => {
    const f = await fixture();
    expect((await service.buyerDetail(f.buyer.id, f.order.id)).id).toBe(
      f.order.id,
    );
    expect(
      (await service.buyerList(f.buyer.id, {})).map((row) => row.id),
    ).toEqual([f.order.id]);
    expect(await service.buyerList(f.stranger.id, {})).toEqual([]);
    await expect(
      service.buyerDetail(f.stranger.id, f.order.id),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(
      (await service.shopList(f.owner.id, f.shop.id, {})).map((row) => row.id),
    ).toEqual([f.order.id]);
    await expect(
      new AuthorizationService(f.db).authorize(
        f.stranger.id,
        f.shop.id,
        'order.view',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      new AuthorizationService(f.db).authorize(
        f.staff.id,
        f.shop.id,
        'order.update',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await f.db.getRepository(ShopMember).delete(f.membership.id);
    await expect(
      new AuthorizationService(f.db).authorize(
        f.owner.id,
        f.shop.id,
        'order.update',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects inconsistent monetary snapshots before any cancellation effects', async () => {
    const f = await fixture();
    await f.db
      .getRepository(Order)
      .update(f.order.id, { subtotal: -1, shippingFee: 230001 });
    await expect(
      service.reject(f.owner.id, f.shop.id, f.order.id, {
        reason: 'Cannot fulfil',
      }),
    ).rejects.toThrow('Invalid order refund amount');
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('pending');
    expect((await new WalletService(f.db).mine(f.buyer.id, {})).balance).toBe(
      0,
    );
  });

  it('accepts concurrently exactly once and rejects incompatible transitions', async () => {
    const f = await fixture();
    const results = await Promise.all([
      service.accept(f.owner.id, f.shop.id, f.order.id),
      service.accept(f.owner.id, f.shop.id, f.order.id),
    ]);
    expect(results.map((row) => row.status)).toEqual([
      'preparing',
      'preparing',
    ]);
    expect((await service.buyerDetail(f.buyer.id, f.order.id)).status).toBe(
      'preparing',
    );
    expect(
      await service.shopList(f.owner.id, f.shop.id, { status: 'pending' }),
    ).toEqual([]);
    expect(
      await f.db
        .getRepository(OrderEvent)
        .countBy({ orderId: f.order.id, action: 'ACCEPTED' }),
    ).toBe(1);
    await expect(
      service.reject(f.owner.id, f.shop.id, f.order.id, {
        reason: 'Cannot fulfil',
      }),
    ).rejects.toThrow('Order is no longer awaiting confirmation');
  });

  it('rejects one Shop order atomically, credits full goods plus shipping once and preserves other orders', async () => {
    const f = await fixture();
    const otherShop = await f.db
      .getRepository(Shop)
      .save(new ShopFactory().build());
    const sibling = await f.db.getRepository(Order).save({
      ...f.order,
      id: randomUUID(),
      shopId: otherShop.id,
      checkoutOrderId: randomUUID(),
      orderCode: `RW-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`,
      items: [],
    });
    await f.db.getRepository(PaymentAttempt).update(f.payment.id, {
      amount: 460000,
      capturedAmount: 460000,
      orders: [
        ...f.payment.orders,
        {
          checkoutOrderId: sibling.checkoutOrderId,
          shopId: sibling.shopId,
          shopName: sibling.shopName,
          subtotal: sibling.subtotal,
          shippingFee: sibling.shippingFee,
          address: sibling.address,
          items: sibling.items,
        },
      ],
    });
    await Promise.all([
      service.reject(f.owner.id, f.shop.id, f.order.id, {
        reason: 'Cannot fulfil',
      }),
      service.reject(f.owner.id, f.shop.id, f.order.id, {
        reason: 'Cannot fulfil',
      }),
    ]);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('cancelled');
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: sibling.id }))
        .status,
    ).toBe('pending');
    expect(
      await f.db.query(
        'SELECT balance, "simulationBalance" FROM wallet_accounts WHERE "userId" = $1',
        [f.buyer.id],
      ),
    ).toEqual([{ balance: '0', simulationBalance: '230000' }]);
    expect(
      await f.db.query(
        'SELECT amount FROM wallet_credits WHERE "orderId" = $1',
        [f.order.id],
      ),
    ).toEqual([{ amount: 230000 }]);
    expect(
      (await f.db.getRepository(Product).findOneByOrFail({ id: f.product.id }))
        .status,
    ).toBe(ProductStatus.ACTIVE);
    expect(
      (
        await f.db
          .getRepository(PaymentAttempt)
          .findOneByOrFail({ id: f.payment.id })
      ).state,
    ).toBe('PAID');
    expect(
      await f.db
        .getRepository(OrderEvent)
        .countBy({ orderId: f.order.id, action: 'REJECTED' }),
    ).toBe(1);
  });

  it('cancels at the exact deadline even when accept races expiry, without duplicate credits', async () => {
    const f = await fixture();
    await f.db
      .getRepository(Order)
      .update(f.order.id, { sellerConfirmBy: new Date(Date.now() - 1) });
    const results = await Promise.allSettled([
      service.accept(f.owner.id, f.shop.id, f.order.id),
      service.expireDue(),
      service.expireDue(),
    ]);
    expect(results[0].status).toBe('rejected');
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .cancellationReason,
    ).toBe('SELLER_CONFIRM_TIMEOUT');
    expect(
      await f.db.query(
        'SELECT COUNT(*)::int AS count FROM wallet_credits WHERE "orderId" = $1',
        [f.order.id],
      ),
    ).toEqual([{ count: 1 }]);
    expect(
      await f.db
        .getRepository(OrderEvent)
        .countBy({ orderId: f.order.id, action: 'EXPIRED' }),
    ).toBe(1);
  });

  it('rejects acceptance after the deadline', async () => {
    const f = await fixture();
    await f.db
      .getRepository(Order)
      .update(f.order.id, { sellerConfirmBy: new Date(Date.now() - 1000) });
    await expect(
      service.accept(f.owner.id, f.shop.id, f.order.id),
    ).rejects.toThrow('Seller confirmation deadline has passed');
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('cancelled');
  });

  it('does not reopen changed, suspended or newly reserved stock when an old order is cancelled', async () => {
    for (const change of [
      'moderation',
      'missing-moderation',
      'shop',
      'suspended',
      'new-order',
      'reserved',
      'category',
    ]) {
      const f = await fixture();
      if (change === 'moderation')
        await f.db
          .getRepository(ProductModeration)
          .update(
            { productId: f.product.id },
            { status: ProductModerationStatus.PENDING, version: 2 },
          );
      if (change === 'missing-moderation')
        await f.db
          .getRepository(ProductModeration)
          .delete({ productId: f.product.id });
      if (change === 'shop')
        await f.db
          .getRepository(Shop)
          .update(f.shop.id, { status: ShopStatus.INACTIVE });
      if (change === 'suspended')
        await f.db
          .getRepository(Product)
          .update(f.product.id, { status: ProductStatus.SUSPENDED });
      if (change === 'new-order')
        await f.db
          .getRepository(Product)
          .update(f.product.id, { soldOrderId: randomUUID() });
      if (change === 'reserved')
        await f.db.getRepository(Product).update(f.product.id, {
          status: ProductStatus.HELD,
          reservationId: randomUUID(),
        });
      if (change === 'category')
        await f.db
          .getRepository(Category)
          .update(f.category.id, { isActive: false });
      await service.reject(f.owner.id, f.shop.id, f.order.id, {
        reason: 'Cannot fulfil',
      });
      const product = await f.db
        .getRepository(Product)
        .findOneByOrFail({ id: f.product.id });
      expect(product.status).toBe(
        ['moderation', 'missing-moderation', 'shop', 'category'].includes(
          change,
        )
          ? ProductStatus.HIDDEN
          : change === 'suspended'
            ? ProductStatus.SUSPENDED
            : change === 'reserved'
              ? ProductStatus.HELD
              : ProductStatus.SOLD,
      );
    }
  });

  it('rolls back cancellation and stock release if the wallet credit cannot be recorded', async () => {
    const f = await fixture();
    // A failing ledger write exercises real transaction rollback, not a mocked repository.
    await f.db.query(
      `CREATE FUNCTION fail_order_credit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ledger unavailable'; END $$`,
    );
    await f.db.query(
      'CREATE TRIGGER fail_order_credit BEFORE INSERT ON wallet_credits FOR EACH ROW EXECUTE FUNCTION fail_order_credit()',
    );
    try {
      await expect(
        service.reject(f.owner.id, f.shop.id, f.order.id, {
          reason: 'Cannot fulfil',
        }),
      ).rejects.toThrow('ledger unavailable');
      expect(
        (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
          .status,
      ).toBe('pending');
      expect(
        (
          await f.db
            .getRepository(Product)
            .findOneByOrFail({ id: f.product.id })
        ).status,
      ).toBe(ProductStatus.SOLD);
    } finally {
      await f.db.query('DROP TRIGGER fail_order_credit ON wallet_credits');
      await f.db.query('DROP FUNCTION fail_order_credit()');
    }
  });

  it('continues expiry of other orders when one refund transaction fails', async () => {
    const failed = await fixture();
    const next = await fixture();
    await failed.db.getRepository(Order).update(failed.order.id, {
      sellerConfirmBy: new Date(Date.now() - 60000),
    });
    await next.db
      .getRepository(Order)
      .update(next.order.id, { sellerConfirmBy: new Date(Date.now() - 30000) });
    await failed.db.query(
      `CREATE FUNCTION fail_one_order_credit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."orderId" = '${failed.order.id}'::uuid THEN RAISE EXCEPTION 'one ledger unavailable'; END IF; RETURN NEW; END $$`,
    );
    await failed.db.query(
      'CREATE TRIGGER fail_one_order_credit BEFORE INSERT ON wallet_credits FOR EACH ROW EXECUTE FUNCTION fail_one_order_credit()',
    );
    try {
      await service.expireDue();
      expect(
        (
          await next.db
            .getRepository(Order)
            .findOneByOrFail({ id: next.order.id })
        ).status,
      ).toBe('cancelled');
      expect(
        (
          await failed.db
            .getRepository(Order)
            .findOneByOrFail({ id: failed.order.id })
        ).status,
      ).toBe('pending');
    } finally {
      await failed.db.query(
        'DROP TRIGGER fail_one_order_credit ON wallet_credits',
      );
      await failed.db.query('DROP FUNCTION fail_one_order_credit()');
    }
    await failed.db
      .getRepository(Order)
      .update(failed.order.id, { expiryRetryAt: null });
    await service.expireDue();
    expect(
      (
        await failed.db
          .getRepository(Order)
          .findOneByOrFail({ id: failed.order.id })
      ).status,
    ).toBe('cancelled');
  });

  it('rolls back an already inserted credit and stock change if saving cancellation fails', async () => {
    const f = await fixture();
    await f.db.query(
      `CREATE FUNCTION fail_order_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'cancelled' THEN RAISE EXCEPTION 'cancellation unavailable'; END IF; RETURN NEW; END $$`,
    );
    await f.db.query(
      'CREATE TRIGGER fail_order_cancellation BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION fail_order_cancellation()',
    );
    try {
      await expect(
        service.reject(f.owner.id, f.shop.id, f.order.id, {
          reason: 'Cannot fulfil',
        }),
      ).rejects.toThrow('cancellation unavailable');
      expect((await new WalletService(f.db).mine(f.buyer.id, {})).balance).toBe(
        0,
      );
      expect(
        await f.db.query(
          'SELECT COUNT(*)::int AS count FROM wallet_credits WHERE "orderId" = $1',
          [f.order.id],
        ),
      ).toEqual([{ count: 0 }]);
      expect(
        (
          await f.db
            .getRepository(Product)
            .findOneByOrFail({ id: f.product.id })
        ).status,
      ).toBe(ProductStatus.SOLD);
    } finally {
      await f.db.query('DROP TRIGGER fail_order_cancellation ON orders');
      await f.db.query('DROP FUNCTION fail_order_cancellation()');
    }
  });

  it('serializes an accept/reject race to a single decision with matching financial effects', async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      service.accept(f.owner.id, f.shop.id, f.order.id),
      service.reject(f.owner.id, f.shop.id, f.order.id, {
        reason: 'Cannot fulfil',
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const order = await f.db
      .getRepository(Order)
      .findOneByOrFail({ id: f.order.id });
    const wallet = await new WalletService(f.db).mine(f.buyer.id, {});
    const accepted = await f.db
      .getRepository(OrderEvent)
      .countBy({ orderId: order.id, action: 'ACCEPTED' });
    const rejected = await f.db
      .getRepository(OrderEvent)
      .countBy({ orderId: order.id, action: 'REJECTED' });
    expect([
      { status: 'preparing', balance: 0, accepted: 1, rejected: 0 },
      { status: 'cancelled', balance: 230000, accepted: 0, rejected: 1 },
    ]).toContainEqual({
      status: order.status,
      balance: wallet.balance,
      accepted,
      rejected,
    });
  });
});
