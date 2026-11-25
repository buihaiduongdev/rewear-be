import { randomUUID } from 'node:crypto';

import { CategoryFactory } from '@/database/factories/category.factory';
import { ProductFactory } from '@/database/factories/product.factory';
import { ShopFactory } from '@/database/factories/shop.factory';
import { UserFactory } from '@/database/factories/user.factory';
import { PayosClient } from '@/infrastructure/payment/payos.client';
import { GhnSandboxAdapter } from '@/infrastructure/shipping/adapters/ghn-sandbox.adapter';
import { CartService } from '@/modules/cart/cart.service';
import { Category } from '@/modules/category/entities';
import { CheckoutService } from '@/modules/checkout/checkout.service';
import { CHECKOUT_STATUS } from '@/modules/checkout/constants/checkout.constant';
import { CheckoutOrder } from '@/modules/checkout/entities/checkout-order.entity';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { ShippingQuoteService } from '@/modules/checkout/shipping-quote.service';
import {
  RECONCILIATION_MODE,
  SHOP_LEDGER_TYPE,
} from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { CoinAccount, CoinOrderDebit } from '@/modules/coins/core/entities';
import { refundFunding } from '@/modules/dispute/dispute-refund-funding';
import { ORDER_STATUS } from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities';
import { OrderFundingService } from '@/modules/order/order-funding.service';
import { PaymentAttempt, PaymentRefund } from '@/modules/payment/entities';
import { PaymentPricing } from '@/modules/payment/payment.pricing';
import { PaymentService } from '@/modules/payment/payment.service';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';
import {
  WalletCheckoutHold,
  WalletDebit,
} from '@/modules/wallet/checkout/entities';
import { WalletCheckoutService } from '@/modules/wallet/checkout/wallet-checkout.service';
import { WALLET_HOLD_STATE } from '@/modules/wallet/constants/wallet.constant';
import { WalletAccount, WalletCredit } from '@/modules/wallet/entities';
import { WalletService } from '@/modules/wallet/wallet.service';

import { createTestDatabase } from '../support/database';
import type { TestDatabase } from '../support/database';

describe('Wallet full checkout (PostgreSQL)', () => {
  let database: TestDatabase;
  let wallet: WalletCheckoutService;
  const carrier = { quote: jest.fn() };
  const client = { createPaymentLink: jest.fn(), verifyWebhook: jest.fn() };
  beforeAll(async () => {
    database = await createTestDatabase();
    wallet = new WalletCheckoutService(
      database.dataSource,
      new PaymentPricing(
        new ShippingQuoteService(
          database.dataSource,
          carrier as unknown as GhnSandboxAdapter,
        ),
      ),
    );
  });
  afterAll(async () => database?.destroy());
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

  async function fund(
    buyerId: string,
    mode: 'EVIDENCE' | 'SIMULATION' = 'EVIDENCE',
  ) {
    const db = database.dataSource;
    const source = await fixture();
    const snapshot = await db
      .getRepository(CheckoutOrder)
      .findOneByOrFail({ checkoutId: source.checkout.id });
    const order = await db.getRepository(Order).save({
      shopId: snapshot.shopId,
      subtotal: snapshot.subtotal,
      address: snapshot.address,
      items: snapshot.items,

      checkoutOrderId: snapshot.id,
      shippingFee: snapshot.shippingFee!,
      checkoutId: source.checkout.id,
      buyerId,
      shopName: 'Funding source',
      paymentMethod: 'PAYOS',
      paymentId: null,
      total: 230000,
      status: 'cancelled',
      sellerConfirmBy: new Date(),
    });
    await db.getRepository(WalletAccount).save({
      userId: buyerId,
      balance: mode === 'EVIDENCE' ? 230000 : 0,
      simulationBalance: mode === 'SIMULATION' ? 230000 : 0,
    });
    await db
      .getRepository(WalletCredit)
      .save({ userId: buyerId, orderId: order.id, amount: 230000, mode });
  }
  async function coinSelection(
    buyerId: string,
    checkoutId: string,
    mode: 'EVIDENCE' | 'SIMULATION',
  ) {
    const db = database.dataSource;
    await db
      .getRepository(CoinAccount)
      .upsert(
        mode === 'SIMULATION'
          ? { userId: buyerId, simulationBalance: 20000 }
          : { userId: buyerId, balance: 20000 },
        ['userId'],
      );
    const checkoutService = new CheckoutService(db, {} as CartService);
    await checkoutService.selectCoins(buyerId, checkoutId, {
      requestId: randomUUID(),
      amount: 20000,
      mode,
    });
    return db.getRepository(CoinAccount).findOneByOrFail({ userId: buyerId });
  }

  it('captures wallet remainder and burns held coins during the live checkout', async () => {
    const { db, buyer, checkout } = await fixture();
    await fund(buyer.id);
    await coinSelection(buyer.id, checkout.id, 'EVIDENCE');
    const hold = await wallet.reserve(buyer.id, checkout.id, {
      requestId: randomUUID(),
      mode: 'EVIDENCE',
      expectedTotal: 210000,
    });
    expect(hold.amount).toBe(210000);
    await wallet.confirm(buyer.id, hold.id);
    const order = await db
      .getRepository(Order)
      .findOneByOrFail({ checkoutId: checkout.id });
    expect(order).toMatchObject({
      subtotal: 200000,
      shippingFee: 30000,
      total: 210000,
      coinDiscount: 20000,
      coinMode: 'EVIDENCE',
    });
    expect(
      await db
        .getRepository(CoinOrderDebit)
        .findOneByOrFail({ orderId: order.id }),
    ).toMatchObject({ amount: 20000, mode: 'EVIDENCE' });
    expect(
      await db.getRepository(CoinAccount).findOneByOrFail({ userId: buyer.id }),
    ).toMatchObject({ balance: 0, heldBalance: 0 });
  });

  it('charges PayOS only the remainder and freezes coins while provider outcome is unresolved', async () => {
    const { db, buyer, checkout } = await fixture();
    await coinSelection(buyer.id, checkout.id, 'SIMULATION');
    const pricing = new PaymentPricing(
      new ShippingQuoteService(db, carrier as unknown as GhnSandboxAdapter),
    );
    const payos = new PaymentService(
      db,
      client as unknown as PayosClient,
      pricing,
    );
    const attempt = await payos.create(buyer.id, checkout.id, {
      requestId: randomUUID(),
    });
    expect(attempt.amount).toBe(210000);
    await expect(
      new CheckoutService(db, {} as CartService).selectCoins(
        buyer.id,
        checkout.id,
        { requestId: randomUUID(), amount: 0, mode: 'SIMULATION' },
      ),
    ).rejects.toThrow('Resolve payment');
    const savedAttempt = await db
      .getRepository(PaymentAttempt)
      .findOneByOrFail({ id: attempt.id });
    await payos.applyResult(attempt.id, {
      orderCode: Number(savedAttempt.providerOrderCode),
      status: 'PAID',
      amount: 210000,
      amountPaid: 210000,
      providerTransId: 'FT123456789',
    });
    const order = await db
      .getRepository(Order)
      .findOneByOrFail({ checkoutId: checkout.id });
    expect(order).toMatchObject({
      total: 210000,
      subtotal: 200000,
      coinDiscount: 20000,
    });
    expect(
      await db
        .getRepository(CoinOrderDebit)
        .findOneByOrFail({ orderId: order.id }),
    ).toMatchObject({ mode: 'SIMULATION', amount: 20000 });
  });

  it('credits gross cancellation money once while consumed coins remain spent', async () => {
    const { db, buyer, checkout } = await fixture();
    await fund(buyer.id);
    await coinSelection(buyer.id, checkout.id, 'EVIDENCE');
    const hold = await wallet.reserve(buyer.id, checkout.id, {
      requestId: randomUUID(),
      mode: 'EVIDENCE',
      expectedTotal: 210000,
    });
    await wallet.confirm(buyer.id, hold.id);
    const order = await db
      .getRepository(Order)
      .findOneByOrFail({ checkoutId: checkout.id });
    const refunds = new WalletService(db);
    await db.transaction(async (manager) => {
      const first = await refunds.creditCancellation(manager, order);
      const replay = await refunds.creditCancellation(manager, order);
      expect(first?.id).toBe(replay?.id);
      expect(first).toMatchObject({ amount: 230000, mode: 'EVIDENCE' });
    });
    expect(
      await db
        .getRepository(WalletAccount)
        .findOneByOrFail({ userId: buyer.id }),
    ).toMatchObject({ balance: 250000, heldBalance: 0 });
    expect(
      await db.getRepository(CoinAccount).findOneByOrFail({ userId: buyer.id }),
    ).toMatchObject({ balance: 0, heldBalance: 0 });
  });

  it('credits gross wallet cancellation with coins once and leaves consumed coins spent', async () => {
    const { db, buyer, checkout } = await fixture();
    await fund(buyer.id);
    await coinSelection(buyer.id, checkout.id, 'EVIDENCE');
    const hold = await wallet.reserve(buyer.id, checkout.id, {
      requestId: randomUUID(),
      mode: 'EVIDENCE',
      expectedTotal: 210000,
    });
    await wallet.confirm(buyer.id, hold.id);
    const order = await db
      .getRepository(Order)
      .findOneByOrFail({ checkoutId: checkout.id });
    const credits = new WalletService(db);
    await db.transaction(async (manager) => {
      const first = await credits.creditCancellation(manager, order);
      const second = await credits.creditCancellation(manager, order);
      expect(first?.id).toBe(second?.id);
      expect(first).toMatchObject({ amount: 230000, mode: 'EVIDENCE' });
    });
    expect(
      await db
        .getRepository(WalletAccount)
        .findOneByOrFail({ userId: buyer.id }),
    ).toMatchObject({ balance: 250000, heldBalance: 0 });
    expect(
      await db.getRepository(CoinAccount).findOneByOrFail({ userId: buyer.id }),
    ).toMatchObject({ balance: 0, heldBalance: 0 });
  });

  it('rejects mixed wallet mode without moving either money or the selected coin hold', async () => {
    const { db, buyer, checkout } = await fixture();
    await fund(buyer.id, 'SIMULATION');
    await coinSelection(buyer.id, checkout.id, 'EVIDENCE');
    await expect(
      wallet.reserve(buyer.id, checkout.id, {
        requestId: randomUUID(),
        mode: 'SIMULATION',
        expectedTotal: 210000,
      }),
    ).rejects.toThrow('same mode');
    expect(
      await db
        .getRepository(WalletCheckoutHold)
        .countBy({ checkoutId: checkout.id }),
    ).toBe(0);
    expect(
      await db.getRepository(CoinAccount).findOneByOrFail({ userId: buyer.id }),
    ).toMatchObject({ balance: 0, heldBalance: 20000 });
    expect(
      await db
        .getRepository(WalletAccount)
        .findOneByOrFail({ userId: buyer.id }),
    ).toMatchObject({ simulationBalance: 230000, simulationHeldBalance: 0 });
  });

  it.each(['cancel', 'expire'] as const)(
    'releases held coins on checkout %s back to buyer balance',
    async (action) => {
      const { db, buyer, checkout } = await fixture();
      await coinSelection(buyer.id, checkout.id, 'EVIDENCE');
      const expiry = new Date(Date.now() - 1000);
      const service = new CheckoutService(db, {} as CartService);
      if (action === 'cancel') await service.cancel(buyer.id, checkout.id);
      else {
        await db
          .getRepository(Checkout)
          .update(checkout.id, { expiresAt: expiry });
        await service.expire();
      }
      expect(
        await db
          .getRepository(CoinAccount)
          .findOneByOrFail({ userId: buyer.id }),
      ).toMatchObject({ balance: 20000, heldBalance: 0 });
    },
  );

  it('allocates multi-Shop checkout discount over gross items with exact total', async () => {
    const first = await fixture();
    const second = await fixture();
    await first.db.getRepository(Checkout).update(first.checkout.id, {
      requestedProductIds: [first.product.id, second.product.id],
    });
    await first.db.getRepository(Checkout).update(first.checkout.id, {
      requestedProductIds: [first.product.id, second.product.id],
    });
    await first.db
      .getRepository(CheckoutOrder)
      .update(
        { checkoutId: second.checkout.id },
        { checkoutId: first.checkout.id },
      );
    await first.db.getRepository(Product).update(second.product.id, {
      reservationId: first.checkout.id,
      heldUntil: first.checkout.expiresAt,
    });
    await first.db
      .getRepository(Checkout)
      .update(second.checkout.id, { status: 'CANCELLED' });
    await first.db.getRepository(CoinAccount).save({
      userId: first.buyer.id,
      simulationBalance: 40000,
    });
    await new CheckoutService(first.db, {} as CartService).selectCoins(
      first.buyer.id,
      first.checkout.id,
      { requestId: randomUUID(), amount: 40000, mode: 'SIMULATION' },
    );
    const pricing = new PaymentPricing(
      new ShippingQuoteService(
        first.db,
        carrier as unknown as GhnSandboxAdapter,
      ),
    );
    const payos = new PaymentService(
      first.db,
      client as unknown as PayosClient,
      pricing,
    );
    const attempt = await payos.create(first.buyer.id, first.checkout.id, {
      requestId: randomUUID(),
    });
    expect(attempt.amount).toBe(420000);
    const saved = await first.db
      .getRepository(PaymentAttempt)
      .findOneByOrFail({ id: attempt.id });
    expect(saved.orders).toHaveLength(2);
    expect(saved.orders.map((row) => row.coinDiscount)).toEqual([20000, 20000]);
    expect(
      saved.orders
        .flatMap((row) => row.items)
        .reduce((sum, row) => sum + (row.coinDiscount ?? 0), 0),
    ).toBe(40000);
    expect(saved.orders.map((row) => row.subtotal)).toEqual([200000, 200000]);
  });

  it('requires conscious coin reduction when the selected discount puts PayOS below its minimum', async () => {
    const f = await fixture();
    const snapshot = await f.db
      .getRepository(CheckoutOrder)
      .findOneByOrFail({ checkoutId: f.checkout.id });
    await f.db.getRepository(CheckoutOrder).update(snapshot.id, {
      subtotal: 2000,
      shippingFee: 0,
      items: snapshot.items.map((item) => ({ ...item, price: 2000 })),
    });
    carrier.quote.mockResolvedValue({ fee: 0, estimatedDeliveryAt: null });
    await f.db.getRepository(CoinAccount).save({
      userId: f.buyer.id,
      simulationBalance: 100,
    });
    const service = new CheckoutService(f.db, {} as CartService);
    await service.selectCoins(f.buyer.id, f.checkout.id, {
      requestId: randomUUID(),
      amount: 100,
      mode: 'SIMULATION',
    });
    const pricing = new PaymentPricing(
      new ShippingQuoteService(f.db, carrier as unknown as GhnSandboxAdapter),
    );
    const payos = new PaymentService(
      f.db,
      client as unknown as PayosClient,
      pricing,
    );
    await expect(
      payos.create(f.buyer.id, f.checkout.id, { requestId: randomUUID() }),
    ).rejects.toThrow('outside PayOS limits');
    expect(
      await f.db.getRepository(Checkout).findOneByOrFail({ id: f.checkout.id }),
    ).toMatchObject({ coinDiscount: 100 });
    expect(
      await f.db
        .getRepository(PaymentAttempt)
        .countBy({ checkoutId: f.checkout.id }),
    ).toBe(0);
    await service.selectCoins(f.buyer.id, f.checkout.id, {
      requestId: randomUUID(),
      amount: 0,
      mode: 'SIMULATION',
    });
    expect(
      (
        await payos.create(f.buyer.id, f.checkout.id, {
          requestId: randomUUID(),
        })
      ).amount,
    ).toBe(2000);
  });

  it('retains an explicit coin selection when PayOS remainder falls below its minimum', async () => {
    const { db, buyer, checkout } = await fixture();
    const snapshot = await db
      .getRepository(CheckoutOrder)
      .findOneByOrFail({ checkoutId: checkout.id });
    snapshot.subtotal = 2000;
    snapshot.items[0].price = 2000;
    await db.getRepository(CheckoutOrder).save(snapshot);
    carrier.quote.mockResolvedValue({ fee: 0, estimatedDeliveryAt: null });
    await db.getRepository(CoinAccount).save({
      userId: buyer.id,
      simulationBalance: 100,
    });
    const selection = new CheckoutService(db, {} as CartService);
    await selection.selectCoins(buyer.id, checkout.id, {
      requestId: randomUUID(),
      amount: 100,
      mode: 'SIMULATION',
    });
    const pricing = new PaymentPricing(
      new ShippingQuoteService(db, carrier as unknown as GhnSandboxAdapter),
    );
    await expect(
      new PaymentService(db, client as unknown as PayosClient, pricing).create(
        buyer.id,
        checkout.id,
        { requestId: randomUUID() },
      ),
    ).rejects.toThrow('outside PayOS limits');
    expect(
      await db.getRepository(Checkout).findOneByOrFail({ id: checkout.id }),
    ).toMatchObject({ coinDiscount: 100 });
    expect(
      await db.getRepository(CoinAccount).findOneByOrFail({ userId: buyer.id }),
    ).toMatchObject({ simulationBalance: 0, simulationHeldBalance: 100 });
    expect(
      await db
        .getRepository(PaymentAttempt)
        .countBy({ checkoutId: checkout.id }),
    ).toBe(0);
  });

  it('serializes competing coin selections across two live checkouts', async () => {
    const first = await fixture();
    const second = await fixture();
    await first.db
      .getRepository(Checkout)
      .update(second.checkout.id, { buyerId: first.buyer.id });
    await first.db.getRepository(CoinAccount).save({
      userId: first.buyer.id,
      balance: 20000,
    });
    const service = new CheckoutService(first.db, {} as CartService);
    const results = await Promise.allSettled(
      [first.checkout.id, second.checkout.id].map((id) =>
        service.selectCoins(first.buyer.id, id, {
          requestId: randomUUID(),
          amount: 20000,
          mode: 'EVIDENCE',
        }),
      ),
    );
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
    expect(
      await first.db
        .getRepository(CoinAccount)
        .findOneByOrFail({ userId: first.buyer.id }),
    ).toMatchObject({ balance: 0, heldBalance: 20000 });
  });

  it('reserves full verified balance and captures once without extending inventory TTL', async () => {
    const { db, buyer, checkout, product } = await fixture();
    await fund(buyer.id);
    const input = {
      requestId: randomUUID(),
      expectedTotal: 230000,
      mode: 'EVIDENCE' as const,
    };
    const hold = await wallet.reserve(buyer.id, checkout.id, input);
    expect(
      await db
        .getRepository(WalletAccount)
        .findOneByOrFail({ userId: buyer.id }),
    ).toMatchObject({ balance: 0, heldBalance: 230000 });
    expect((await wallet.reserve(buyer.id, checkout.id, input)).id).toBe(
      hold.id,
    );
    await Promise.all([
      wallet.confirm(buyer.id, hold.id),
      wallet.confirm(buyer.id, hold.id),
    ]);
    expect(
      await db.getRepository(WalletDebit).countBy({ holdId: hold.id }),
    ).toBe(1);
    const order = await db
      .getRepository(Order)
      .findOneByOrFail({ checkoutId: checkout.id });
    expect(order.paymentMethod).toBe('WALLET');
    expect(
      order.sellerConfirmBy.getTime() - hold.createdAt.getTime(),
    ).toBeGreaterThan(86300000);
    expect(
      (await db.getRepository(Checkout).findOneByOrFail({ id: checkout.id }))
        .expiresAt,
    ).toEqual(checkout.expiresAt);
    expect(
      (await db.getRepository(Product).findOneByOrFail({ id: product.id }))
        .status,
    ).toBe(ProductStatus.SOLD);
  });
  it('releases simulation only and never converts it to evidence', async () => {
    const { db, buyer, checkout } = await fixture();
    await fund(buyer.id, 'SIMULATION');
    await expect(
      wallet.reserve(buyer.id, checkout.id, {
        requestId: randomUUID(),
        expectedTotal: 230000,
        mode: 'EVIDENCE',
      }),
    ).rejects.toThrow('Insufficient');
    const hold = await wallet.reserve(buyer.id, checkout.id, {
      requestId: randomUUID(),
      expectedTotal: 230000,
      mode: 'SIMULATION',
    });
    await wallet.release(buyer.id, hold.id);
    await wallet.release(buyer.id, hold.id);
    expect(
      await db
        .getRepository(WalletAccount)
        .findOneByOrFail({ userId: buyer.id }),
    ).toMatchObject({
      balance: 0,
      simulationBalance: 230000,
      simulationHeldBalance: 0,
    });
  });
  it('commits expiry release before returning an expired-confirm conflict', async () => {
    const { db, buyer, checkout } = await fixture();
    await fund(buyer.id);
    const hold = await wallet.reserve(buyer.id, checkout.id, {
      requestId: randomUUID(),
      expectedTotal: 230000,
      mode: 'EVIDENCE',
    });
    await db
      .getRepository(WalletCheckoutHold)
      .update(hold.id, { expiresAt: new Date(0) });
    await expect(wallet.confirm(buyer.id, hold.id)).rejects.toThrow('expired');
    expect(
      await db
        .getRepository(WalletAccount)
        .findOneByOrFail({ userId: buyer.id }),
    ).toMatchObject({ balance: 230000, heldBalance: 0 });
    expect(
      (
        await db
          .getRepository(WalletCheckoutHold)
          .findOneByOrFail({ id: hold.id })
      ).state,
    ).toBe('EXPIRED');
  });
  it('rejects mismatched buyer-confirmed totals before reserving money', async () => {
    const { db, buyer, checkout } = await fixture();
    await fund(buyer.id);
    await expect(
      wallet.reserve(buyer.id, checkout.id, {
        requestId: randomUUID(),
        expectedTotal: 229999,
        mode: 'EVIDENCE',
      }),
    ).rejects.toThrow('total');
    expect(
      (
        await db
          .getRepository(WalletAccount)
          .findOneByOrFail({ userId: buyer.id })
      ).heldBalance,
    ).toBe(0);
  });
  it('blocks unresolved external payment and refunds a late failed PayOS capture after wallet selection', async () => {
    const { db, buyer, checkout } = await fixture();
    await fund(buyer.id);
    const payos = new PaymentService(
      db,
      client as unknown as PayosClient,
      new PaymentPricing(
        new ShippingQuoteService(db, carrier as unknown as GhnSandboxAdapter),
      ),
    );
    const attempt = await payos.create(buyer.id, checkout.id, {
      requestId: randomUUID(),
    });
    await expect(
      wallet.reserve(buyer.id, checkout.id, {
        requestId: randomUUID(),
        expectedTotal: 230000,
        mode: 'EVIDENCE',
      }),
    ).rejects.toThrow('Resolve external');
    await db
      .getRepository(PaymentAttempt)
      .update(attempt.id, { state: 'FAILED' });
    const hold = await wallet.reserve(buyer.id, checkout.id, {
      requestId: randomUUID(),
      expectedTotal: 230000,
      mode: 'EVIDENCE',
    });
    const savedAttempt = await db
      .getRepository(PaymentAttempt)
      .findOneByOrFail({ id: attempt.id });
    await payos.applyResult(attempt.id, {
      orderCode: Number(savedAttempt.providerOrderCode),
      status: 'PAID',
      amount: 230000,
      amountPaid: 230000,
      providerTransId: 'FT99111',
    });
    expect(
      (
        await db
          .getRepository(PaymentAttempt)
          .findOneByOrFail({ id: attempt.id })
      ).state,
    ).toBe('REFUND_REQUIRED');
    expect(
      await db.getRepository(PaymentRefund).countBy({ paymentId: attempt.id }),
    ).toBe(1);
    expect(
      await db.getRepository(Order).countBy({ checkoutId: checkout.id }),
    ).toBe(0);
    await wallet.confirm(buyer.id, hold.id);
    expect(
      await db
        .getRepository(Order)
        .countBy({ checkoutId: checkout.id, paymentMethod: 'WALLET' }),
    ).toBe(1);
  });
  it('serializes wallet capacity across two simultaneous checkouts', async () => {
    const first = await fixture();
    const second = await fixture();
    await fund(first.buyer.id);
    await second.db
      .getRepository(Checkout)
      .update(second.checkout.id, { buyerId: first.buyer.id });
    const results = await Promise.allSettled(
      [first.checkout.id, second.checkout.id].map((id) =>
        wallet.reserve(first.buyer.id, id, {
          requestId: randomUUID(),
          expectedTotal: 230000,
          mode: 'EVIDENCE',
        }),
      ),
    );
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(
      await first.db
        .getRepository(WalletAccount)
        .findOneByOrFail({ userId: first.buyer.id }),
    ).toMatchObject({ balance: 0, heldBalance: 230000 });
  });
  it.each(Object.values(RECONCILIATION_MODE))(
    'captured %s wallet cancellation restores only its source pool once',
    async (mode) => {
      const { db, buyer, checkout } = await fixture();
      await fund(buyer.id, mode);
      const hold = await wallet.reserve(buyer.id, checkout.id, {
        requestId: randomUUID(),
        expectedTotal: 230000,
        mode,
      });
      await wallet.confirm(buyer.id, hold.id);
      const order = await db
        .getRepository(Order)
        .findOneByOrFail({ checkoutId: checkout.id });
      const credits = new WalletService(db);
      await db.transaction(async (manager) => {
        order.status = ORDER_STATUS.CANCELLED;
        await manager.save(order);
        await credits.creditCancellation(manager, order);
        await credits.creditCancellation(manager, order);
      });
      const account = await db
        .getRepository(WalletAccount)
        .findOneByOrFail({ userId: buyer.id });
      expect(account.balance).toBe(
        mode === RECONCILIATION_MODE.EVIDENCE ? 230000 : 0,
      );
      expect(account.simulationBalance).toBe(
        mode === RECONCILIATION_MODE.SIMULATION ? 230000 : 0,
      );
      expect(account.heldBalance + account.simulationHeldBalance).toBe(0);
      expect(
        await db
          .getRepository(WalletCredit)
          .countBy({ orderId: order.id, mode }),
      ).toBe(1);
    },
  );
  it.each(Object.values(RECONCILIATION_MODE))(
    'captured %s wallet proves Shop funding and dispute refund funding',
    async (mode) => {
      const { db, buyer, checkout } = await fixture();
      await fund(buyer.id, mode);
      const hold = await wallet.reserve(buyer.id, checkout.id, {
        requestId: randomUUID(),
        expectedTotal: 230000,
        mode,
      });
      await wallet.confirm(buyer.id, hold.id);
      const order = await db
        .getRepository(Order)
        .findOneByOrFail({ checkoutId: checkout.id });
      order.status = ORDER_STATUS.DELIVERED;
      order.deliveryObservedAt = new Date(Date.now() + 1000);
      await db.getRepository(Order).save(order);
      const shipment = await db.getRepository(Shipment).save({
        orderId: order.id,
        state: 'BOOKED',
        orderCode: randomUUID(),
        payload: {},
        input: {} as Shipment['input'],
        quotedParcel: {} as Shipment['quotedParcel'],
        codAmount: 0,
        providerStatus: 'delivered',
      });
      await db.transaction(async (manager) => {
        const credit = await new OrderFundingService().heldCredit(
          manager,
          order,
          shipment,
        );
        expect(credit).toMatchObject({
          mode,
          type: SHOP_LEDGER_TYPE.WALLET_FUNDED_HELD,
          shopId: order.shopId,
          amount: 194000,
        });
        expect(
          await refundFunding(manager, order, new Date(Date.now() + 2000)),
        ).toMatchObject({ mode, funded: true, itemFundsAvailable: 200000 });
      });
      expect(
        await db.getRepository(ShopLedgerEntry).countBy({ orderId: order.id }),
      ).toBe(1);
      await db.getRepository(Order).update(order.id, {
        address: {
          ...order.address,
          addressLine1: 'Altered address after capture',
        },
      });
      const changed = await db
        .getRepository(Order)
        .findOneByOrFail({ id: order.id });
      expect(
        await refundFunding(db.manager, changed, new Date(Date.now() + 2000)),
      ).toBeNull();
      await db
        .getRepository(Order)
        .update(order.id, { subtotal: 199999, total: 229999 });
      const inconsistent = await db
        .getRepository(Order)
        .findOneByOrFail({ id: order.id });
      await expect(
        refundFunding(db.manager, inconsistent, new Date(Date.now() + 2000)),
      ).rejects.toThrow('Invalid order money');
    },
  );
  it.each(['cancel', 'expire'] as const)(
    'checkout %s restores held money and inventory together',
    async (action) => {
      const { db, buyer, checkout, product } = await fixture();
      await fund(buyer.id);
      const hold = await wallet.reserve(buyer.id, checkout.id, {
        requestId: randomUUID(),
        expectedTotal: 230000,
        mode: RECONCILIATION_MODE.EVIDENCE,
      });
      const checkouts = new CheckoutService(
        db,
        new CartService(db, {
          getPublicUrl: (key: string) => `https://public.test/${key}`,
        } as never),
      );
      if (action === 'cancel') await checkouts.cancel(buyer.id, checkout.id);
      else {
        await db
          .getRepository(Checkout)
          .update(checkout.id, { expiresAt: new Date(0) });
        await checkouts.expire();
      }
      expect(
        (
          await db
            .getRepository(WalletCheckoutHold)
            .findOneByOrFail({ id: hold.id })
        ).state,
      ).toBe(
        action === 'cancel'
          ? WALLET_HOLD_STATE.RELEASED
          : WALLET_HOLD_STATE.EXPIRED,
      );
      expect(
        await db
          .getRepository(WalletAccount)
          .findOneByOrFail({ userId: buyer.id }),
      ).toMatchObject({ balance: 230000, heldBalance: 0 });
      expect(
        await db.getRepository(Product).findOneByOrFail({ id: product.id }),
      ).toMatchObject({
        status: ProductStatus.ACTIVE,
        reservationId: null,
        heldUntil: null,
      });
      expect(
        (await db.getRepository(Checkout).findOneByOrFail({ id: checkout.id }))
          .status,
      ).toBe(
        action === 'cancel'
          ? CHECKOUT_STATUS.CANCELLED
          : CHECKOUT_STATUS.EXPIRED,
      );
    },
  );
});
