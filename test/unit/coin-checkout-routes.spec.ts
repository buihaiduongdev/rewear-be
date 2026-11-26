import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import type { CartService } from '@/modules/cart/cart.service';
import { CheckoutService } from '@/modules/checkout/checkout.service';
import { CheckoutOrder } from '@/modules/checkout/entities/checkout-order.entity';
import { CodService } from '@/modules/cod/cod.service';
import type { CodPolicy } from '@/modules/cod/policies/cod.policy';
import { CoinService } from '@/modules/coins/core/coin.service';
import type { OutboxService } from '@/modules/event/outbox.service';
import { Order } from '@/modules/order/entities';
import { PaymentAttempt } from '@/modules/payment/entities';
import type { PaymentPricing } from '@/modules/payment/payment.pricing';
import { PaymentService } from '@/modules/payment/payment.service';
import { WalletCheckoutHold } from '@/modules/wallet/checkout/entities';
import { WalletCheckoutService } from '@/modules/wallet/checkout/wallet-checkout.service';

jest.mock('@/modules/cart', () => ({ CartService: class {} }));

describe('coin checkout payment routes', () => {
  afterEach(() => jest.restoreAllMocks());
  const now = new Date();
  const checkout = () => ({
    id: randomUUID(),
    buyerId: randomUUID(),
    status: 'HELD',
    expiresAt: new Date(now.getTime() + 600000),
    coinDiscount: 1000,
    coinMode: 'SIMULATION',
  });
  function managerFor(row: ReturnType<typeof checkout>) {
    return {
      query: jest.fn(async () => [{ now }]),
      findOne: jest.fn(async () => row),
      findOneOrFail: jest.fn(async () => row),
      findOneByOrFail: jest.fn(async () => row),
      find: jest.fn(async (entity: unknown) =>
        entity === CheckoutOrder
          ? [
              {
                subtotal: 10000,
                shop: { name: 'Shop' },
                items: [{ productId: 'item', price: 10000 }],
              },
            ]
          : [],
      ),
      existsBy: jest.fn(async () => false),
      save: jest.fn(async (...args: unknown[]) => args[args.length - 1]),
      create: jest.fn((_entity: unknown, value: unknown) => value),
      insert: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
    };
  }
  it('selects exact coins without extending checkout expiry', async () => {
    const row = checkout();
    const expires = row.expiresAt;
    const manager = managerFor(row);
    const reserve = jest
      .spyOn(CoinService.prototype, 'reserveCheckoutCoins')
      .mockResolvedValue([]);
    const db = {
      transaction: (fn: (manager: unknown) => unknown) => fn(manager),
    };
    const service = new CheckoutService(
      db as unknown as DataSource,
      {} as CartService,
    );
    const requestId = randomUUID();
    await service.selectCoins(row.buyerId, row.id, {
      requestId,
      amount: 500,
      mode: 'SIMULATION',
    });
    expect(reserve).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ subtotal: 10000, expiresAt: expires }),
      500,
      'SIMULATION',
      requestId,
      now,
    );
    expect(row.expiresAt).toBe(expires);
    expect(row.coinDiscount).toBe(500);
  });
  it.each([PaymentAttempt, WalletCheckoutHold])(
    'blocks selection while a provider attempt or wallet hold is unresolved',
    async (entity) => {
      const row = checkout();
      const manager = managerFor(row);
      manager.find.mockImplementation(async (token) =>
        token === PaymentAttempt && entity === PaymentAttempt
          ? ([{ state: 'UNKNOWN' }] as never)
          : [],
      );
      manager.existsBy.mockResolvedValue(entity === WalletCheckoutHold);
      const reserve = jest
        .spyOn(CoinService.prototype, 'reserveCheckoutCoins')
        .mockResolvedValue([]);
      const db = {
        transaction: (fn: (manager: unknown) => unknown) => fn(manager),
      };
      await expect(
        new CheckoutService(
          db as unknown as DataSource,
          {} as CartService,
        ).selectCoins(row.buyerId, row.id, {
          requestId: randomUUID(),
          amount: 0,
          mode: 'SIMULATION',
        }),
      ).rejects.toThrow('Resolve payment');
      expect(reserve).not.toHaveBeenCalled();
    },
  );
  it('PayOS rejects net amount below minimum without silently reducing selected coins', async () => {
    const row = checkout();
    row.coinDiscount = 100;
    const manager = managerFor(row);
    const pricing = {
      snapshot: jest.fn(async () => [
        { subtotal: 2000, shippingFee: 0, coinDiscount: 100 },
      ]),
    };
    const service = new PaymentService(
      {} as DataSource,
      null,
      pricing as unknown as PaymentPricing,
      { record: jest.fn() } as unknown as OutboxService,
    );
    await expect(
      (service as any).prepareAttempt(
        manager,
        row.buyerId,
        row.id,
        randomUUID(),
        {},
      ),
    ).rejects.toThrow('outside PayOS limits');
    expect(row.coinDiscount).toBe(100);
  });
  it('PayOS gateway rejects evidence coins before preparing provider amounts', async () => {
    const row = checkout();
    row.coinMode = 'EVIDENCE';
    const manager = managerFor(row);
    const pricing = { snapshot: jest.fn() };
    const service = new PaymentService(
      {} as DataSource,
      null,
      pricing as unknown as PaymentPricing,
      { record: jest.fn() } as unknown as OutboxService,
    );
    await expect(
      (service as any).prepareAttempt(
        manager,
        row.buyerId,
        row.id,
        randomUUID(),
        {},
      ),
    ).rejects.toThrow('simulation coins');
    expect(pricing.snapshot).not.toHaveBeenCalled();
  });
  it('COD stores net collection and gross subtotal and item snapshots', async () => {
    const row = checkout();
    const manager = managerFor(row);
    const snapshot = {
      checkoutOrderId: randomUUID(),
      subtotal: 10000,
      shippingFee: 2000,
      coinDiscount: 1000,
      coinMode: 'SIMULATION',
      items: [{ productId: randomUUID(), price: 10000, coinDiscount: 1000 }],
    };
    const service = new CodService(
      {} as DataSource,
      {} as PaymentPricing,
      {} as CodPolicy,
      { record: jest.fn() } as unknown as OutboxService,
    );
    const orders = await (service as any).createOrders(
      manager,
      row.buyerId,
      row.id,
      [snapshot],
      now,
    );
    expect(orders[0]).toMatchObject({
      subtotal: 10000,
      total: 11000,
      coinDiscount: 1000,
      items: snapshot.items,
    });
  });
  it('wallet stores the same net payable and leaves seller subtotal gross', async () => {
    const row = checkout();
    const manager = managerFor(row);
    const snapshot = {
      checkoutOrderId: randomUUID(),
      subtotal: 10000,
      shippingFee: 2000,
      coinDiscount: 1000,
      coinMode: 'SIMULATION',
      items: [{ productId: randomUUID(), price: 10000, coinDiscount: 1000 }],
    };
    const service = new WalletCheckoutService(
      {} as DataSource,
      {} as PaymentPricing,
      { record: jest.fn() } as unknown as OutboxService,
    );
    await (service as any).createOrders(
      manager,
      { checkoutId: row.id, buyerId: row.buyerId, orders: [snapshot] },
      row,
      { id: randomUUID() },
      now,
    );
    const savedOrder = manager.save.mock.calls.find(
      (call) => call[0] === Order,
    )?.[1];
    expect(savedOrder).toMatchObject({
      subtotal: 10000,
      total: 11000,
      coinDiscount: 1000,
    });
  });
});
