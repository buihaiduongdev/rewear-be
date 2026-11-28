import { randomUUID } from 'node:crypto';

import {
  CoinService,
  verifiedOrderCoinDebit,
} from '@/modules/coins/coin.service';
import {
  CoinAccount,
  CoinOrderDebit,
  CoinPurchaseReward,
  CoinReservation,
} from '@/modules/coins/entities';
import type { Order } from '@/modules/order/entities';

import { createTestDatabase, TestDatabase } from '../support/database';

describe('Coin account, checkout holds, and reward clawback (PostgreSQL)', () => {
  let database: TestDatabase;
  let coins: CoinService;
  const now = new Date('2026-11-21T00:00:00Z');

  beforeAll(async () => {
    database = await createTestDatabase();
    coins = new CoinService(database.dataSource);
  });

  afterAll(async () => database?.destroy());

  async function grant(
    buyerId: string,
    amount = 100,
    mode: 'EVIDENCE' | 'SIMULATION' = 'EVIDENCE',
  ) {
    return database.dataSource.transaction((manager) =>
      coins.grantPurchaseReward(
        manager,
        buyerId,
        randomUUID(),
        amount,
        mode,
        now,
      ),
    );
  }

  it('isolates modes, enforces 10% cap, preserves checkout deadline, and burns once with order debit proof', async () => {
    const buyerId = randomUUID();
    const checkoutId = randomUUID();
    await grant(buyerId, 100, 'SIMULATION');

    const checkout = {
      id: checkoutId,
      buyerId,
      expiresAt: new Date(now.getTime() + 600_000),
      subtotal: 1000,
    };

    await expect(
      database.dataSource.transaction((manager) =>
        coins.reserveCheckoutCoins(
          manager,
          checkout,
          50,
          'EVIDENCE',
          randomUUID(),
          now,
        ),
      ),
    ).rejects.toThrow('Insufficient');

    await grant(buyerId, 200, 'EVIDENCE');

    await expect(
      database.dataSource.transaction((manager) =>
        coins.reserveCheckoutCoins(
          manager,
          checkout,
          101,
          'EVIDENCE',
          randomUUID(),
          now,
        ),
      ),
    ).rejects.toThrow('10%');

    await database.dataSource.transaction((manager) =>
      coins.reserveCheckoutCoins(
        manager,
        checkout,
        50,
        'EVIDENCE',
        randomUUID(),
        now,
      ),
    );

    const order = {
      id: randomUUID(),
      buyerId,
      coinDiscount: 50,
      coinMode: 'EVIDENCE' as const,
    } as Order;

    await database.dataSource.transaction(async (manager) => {
      await coins.consumeCheckoutCoins(
        manager,
        checkout.id,
        [order],
        'EVIDENCE',
        now,
      );
      await coins.consumeCheckoutCoins(
        manager,
        checkout.id,
        [order],
        'EVIDENCE',
        now,
      );
      expect(await verifiedOrderCoinDebit(manager, order, 'EVIDENCE')).toBe(
        true,
      );
    });

    expect(
      await database.dataSource.manager.findOneByOrFail(CoinAccount, {
        userId: buyerId,
      }),
    ).toMatchObject({
      balance: 150,
      heldBalance: 0,
      simulationBalance: 100,
      simulationHeldBalance: 0,
    });
    expect(
      await database.dataSource.manager.countBy(CoinOrderDebit, {
        orderId: order.id,
      }),
    ).toBe(1);
    expect(
      await database.dataSource.manager.countBy(CoinReservation, {
        checkoutId: checkout.id,
      }),
    ).toBe(0);
  });

  it('serializes concurrent grantPurchaseReward and concurrent consumeOrderCoins idempotently', async () => {
    const buyerId = randomUUID();
    const rewardOrderId = randomUUID();
    const [r1, r2] = await Promise.all([
      database.dataSource.transaction((manager) =>
        coins.grantPurchaseReward(
          manager,
          buyerId,
          rewardOrderId,
          200,
          'EVIDENCE',
          now,
        ),
      ),
      database.dataSource.transaction((manager) =>
        coins.grantPurchaseReward(
          manager,
          buyerId,
          rewardOrderId,
          200,
          'EVIDENCE',
          now,
        ),
      ),
    ]);
    expect(r1.id).toBe(r2.id);

    const checkout = {
      id: randomUUID(),
      buyerId,
      subtotal: 2000,
      expiresAt: new Date(now.getTime() + 600_000),
    };
    const codOrder = {
      id: randomUUID(),
      buyerId,
      coinDiscount: 200,
      coinMode: 'EVIDENCE' as const,
    };
    await database.dataSource.transaction(async (manager) => {
      await coins.reserveCheckoutCoins(
        manager,
        checkout,
        200,
        'EVIDENCE',
        randomUUID(),
        now,
      );
      await coins.commitCodCoins(manager, checkout.id, [codOrder], now);
    });

    const [d1, d2] = await Promise.all([
      database.dataSource.transaction((manager) =>
        coins.consumeOrderCoins(manager, codOrder, 'EVIDENCE', now),
      ),
      database.dataSource.transaction((manager) =>
        coins.consumeOrderCoins(manager, codOrder, 'EVIDENCE', now),
      ),
    ]);
    expect(d1?.id).toBe(d2?.id);
    expect(
      await database.dataSource.manager.findOneByOrFail(CoinAccount, {
        userId: buyerId,
      }),
    ).toMatchObject({ balance: 0, heldBalance: 0 });
  });

  it('updates checkout holds cleanly on re-selection and restores balance on release', async () => {
    const buyerId = randomUUID();
    await grant(buyerId, 100);
    const checkout = {
      id: randomUUID(),
      buyerId,
      subtotal: 1000,
      expiresAt: new Date(now.getTime() + 600_000),
    };

    await database.dataSource.transaction((manager) =>
      coins.reserveCheckoutCoins(
        manager,
        checkout,
        30,
        'EVIDENCE',
        randomUUID(),
        now,
      ),
    );
    await database.dataSource.transaction((manager) =>
      coins.reserveCheckoutCoins(
        manager,
        checkout,
        60,
        'EVIDENCE',
        randomUUID(),
        now,
      ),
    );

    const held = await database.dataSource.manager.findBy(CoinReservation, {
      checkoutId: checkout.id,
      state: 'HELD',
    });
    expect(held).toHaveLength(1);
    expect(held[0].amount).toBe(60);
    expect(held[0].expiresAt?.getTime()).toBe(checkout.expiresAt.getTime());

    await database.dataSource.transaction((manager) =>
      coins.releaseCheckoutCoins(manager, checkout.id, now),
    );
    expect(
      await database.dataSource.manager.findOneByOrFail(CoinAccount, {
        userId: buyerId,
      }),
    ).toMatchObject({ balance: 100, heldBalance: 0 });
  });

  it('commits COD holds without TTL and restores balance when COD order is cancelled', async () => {
    const buyerId = randomUUID();
    await grant(buyerId, 100);
    const checkout = {
      id: randomUUID(),
      buyerId,
      expiresAt: new Date(now.getTime() + 600_000),
      subtotal: 1000,
    };
    const order = {
      id: randomUUID(),
      buyerId,
      coinDiscount: 100,
      coinMode: 'EVIDENCE' as const,
    };

    await database.dataSource.transaction(async (manager) => {
      await coins.reserveCheckoutCoins(
        manager,
        checkout,
        100,
        'EVIDENCE',
        randomUUID(),
        now,
      );
      await coins.commitCodCoins(manager, checkout.id, [order], now);
      expect(
        await manager.findOneByOrFail(CoinReservation, {
          orderId: order.id,
          state: 'COD',
        }),
      ).toMatchObject({ amount: 100, expiresAt: null });

      await coins.releaseOrderCoins(manager, order, 'BUYER_CHANGE', now);
    });

    expect(
      await database.dataSource.manager.findOneByOrFail(CoinAccount, {
        userId: buyerId,
      }),
    ).toMatchObject({ balance: 100, heldBalance: 0 });
  });

  it('claws back available coins up to zero without disturbing active checkout holds', async () => {
    const buyerId = randomUUID();
    const reward = await grant(buyerId, 100);
    const checkout = {
      id: randomUUID(),
      buyerId,
      subtotal: 1000,
      expiresAt: new Date(now.getTime() + 600_000),
    };

    await database.dataSource.transaction(async (manager) => {
      await coins.reserveCheckoutCoins(
        manager,
        checkout,
        70,
        'EVIDENCE',
        randomUUID(),
        now,
      );
      const deducted = await coins.clawbackCoins(
        manager,
        buyerId,
        100,
        'EVIDENCE',
      );
      expect(deducted).toBe(30);
    });

    expect(
      await database.dataSource.manager.findOneByOrFail(CoinAccount, {
        userId: buyerId,
      }),
    ).toMatchObject({ balance: 0, heldBalance: 70 });
    expect(
      await database.dataSource.manager.findOneByOrFail(CoinPurchaseReward, {
        id: reward.id,
      }),
    ).toMatchObject({ grantedAmount: 100, entitlement: 100 });
  });
});
