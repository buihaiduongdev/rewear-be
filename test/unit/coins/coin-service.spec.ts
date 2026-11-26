import { randomUUID } from 'node:crypto';

import type { DataSource, EntityManager } from 'typeorm';

import {
  adjustPurchaseReward,
  CoinRewardService,
} from '@/modules/coins/coin-reward.service';
import { CoinRewardWorker } from '@/modules/coins/coin-reward.worker';
import {
  CoinService,
  verifiedOrderCoinDebit,
} from '@/modules/coins/coin.service';
import { COIN_POLICY } from '@/modules/coins/constants/coin.constant';
import {
  CoinAccount,
  CoinOrderDebit,
  CoinPurchaseReward,
  CoinReservation,
} from '@/modules/coins/entities';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund-credit.entity';
import { ORDER_POLICY } from '@/modules/order/constants/order.constant';
import type { Order } from '@/modules/order/entities';
import { WalletCredit } from '@/modules/wallet/entities';

function createInMemoryManager() {
  const accounts = new Map<string, CoinAccount>();
  const reservations: CoinReservation[] = [];
  const debits: CoinOrderDebit[] = [];
  const rewards: CoinPurchaseReward[] = [];
  const disputeRefunds: DisputeRefundCredit[] = [];
  const walletCredits: WalletCredit[] = [];

  const matchWhere = (row: Record<string, any>, where: Record<string, any>) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && '_type' in v && v._type === 'in') {
        return v._value.includes(row[k]);
      }
      return row[k] === v;
    });

  const manager = {
    queryRunner: { isTransactionActive: true },
    createQueryBuilder: () => ({
      insert: () => ({
        into: () => ({
          values: ({ userId }: { userId: string }) => ({
            orIgnore: () => ({
              execute: async () => {
                if (!accounts.has(userId)) {
                  accounts.set(userId, {
                    id: randomUUID(),
                    userId,
                    balance: 0,
                    heldBalance: 0,
                    simulationBalance: 0,
                    simulationHeldBalance: 0,
                  } as CoinAccount);
                }
              },
            }),
          }),
        }),
      }),
    }),
    create: (_entity: unknown, value: Record<string, unknown>) => ({
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...value,
    }),
    save: async (entity: unknown, value: any) => {
      if (entity === CoinAccount) {
        accounts.set(value.userId, value);
        return value;
      }
      if (entity === CoinReservation) {
        const idx = reservations.findIndex((r) => r.id === value.id);
        if (idx >= 0) reservations[idx] = value;
        else reservations.push(value);
        return value;
      }
      if (entity === CoinOrderDebit) {
        debits.push(value);
        return value;
      }
      if (entity === CoinPurchaseReward) {
        const idx = rewards.findIndex((r) => r.id === value.id);
        if (idx >= 0) rewards[idx] = value;
        else rewards.push(value);
        return value;
      }
      return value;
    },
    remove: async (_entity: unknown, rows: CoinReservation[]) => {
      for (const row of rows) {
        const idx = reservations.findIndex((r) => r.id === row.id);
        if (idx >= 0) reservations.splice(idx, 1);
      }
    },
    findOneOrFail: async (entity: unknown, opts: { where: any }) => {
      if (entity === CoinAccount) {
        const found = accounts.get(opts.where.userId);
        if (!found) throw new Error('Account not found');
        return found;
      }
      throw new Error('Unsupported entity');
    },
    findOne: async (entity: unknown, opts: { where: any }) => {
      if (entity === CoinPurchaseReward) {
        return rewards.find((r) => matchWhere(r, opts.where)) ?? null;
      }
      return null;
    },
    findOneBy: async (entity: unknown, where: any) => {
      if (entity === CoinOrderDebit)
        return debits.find((r) => matchWhere(r, where)) ?? null;
      if (entity === CoinPurchaseReward)
        return rewards.find((r) => matchWhere(r, where)) ?? null;
      if (entity === WalletCredit)
        return walletCredits.find((r) => matchWhere(r, where)) ?? null;
      return null;
    },
    find: async (entity: unknown, opts: { where: any }) => {
      if (entity === CoinReservation)
        return reservations.filter((r) => matchWhere(r, opts.where));
      return [];
    },
    findBy: async (entity: unknown, where: any) => {
      if (entity === CoinReservation)
        return reservations.filter((r) => matchWhere(r, where));
      if (entity === CoinOrderDebit)
        return debits.filter((r) => matchWhere(r, where));
      if (entity === DisputeRefundCredit)
        return disputeRefunds.filter((r) => matchWhere(r, where));
      return [];
    },
  };

  return {
    manager: manager as unknown as EntityManager,
    accounts,
    reservations,
    debits,
    rewards,
    disputeRefunds,
  };
}

describe('CoinService flat balance, hold, debit, and reward clawback', () => {
  const coins = new CoinService({} as DataSource);
  const now = new Date('2026-11-25T00:00:00Z');

  it('grants purchase rewards, caps checkout holds at 10%, removes consumed holds, and captures verified order debits', async () => {
    const store = createInMemoryManager();
    const buyerId = randomUUID();
    const rewardOrderId = randomUUID();

    await coins.grantPurchaseReward(
      store.manager,
      buyerId,
      rewardOrderId,
      500,
      'EVIDENCE',
      now,
    );
    expect(store.accounts.get(buyerId)?.balance).toBe(500);

    await expect(
      coins.grantPurchaseReward(
        store.manager,
        buyerId,
        randomUUID(),
        COIN_POLICY.MAX_POSTGRES_AMOUNT,
        'EVIDENCE',
        now,
      ),
    ).rejects.toThrow('limit exceeded');

    const checkout = {
      id: randomUUID(),
      buyerId,
      subtotal: 4000,
      expiresAt: new Date(now.getTime() + 600_000),
    };

    await expect(
      coins.reserveCheckoutCoins(
        store.manager,
        checkout,
        401,
        'EVIDENCE',
        randomUUID(),
        now,
      ),
    ).rejects.toThrow('10%');

    await coins.reserveCheckoutCoins(
      store.manager,
      checkout,
      400,
      'EVIDENCE',
      randomUUID(),
      now,
    );
    expect(store.accounts.get(buyerId)).toMatchObject({
      balance: 100,
      heldBalance: 400,
    });

    const order = {
      id: randomUUID(),
      buyerId,
      coinDiscount: 400,
      coinMode: 'EVIDENCE' as const,
    } as Order;

    await coins.consumeCheckoutCoins(
      store.manager,
      checkout.id,
      [order],
      'EVIDENCE',
      now,
    );
    expect(store.reservations).toHaveLength(0);
    expect(store.debits).toHaveLength(1);
    expect(store.accounts.get(buyerId)).toMatchObject({
      balance: 100,
      heldBalance: 0,
    });
    expect(await verifiedOrderCoinDebit(store.manager, order, 'EVIDENCE')).toBe(
      true,
    );
    expect(
      await verifiedOrderCoinDebit(store.manager, order, 'SIMULATION'),
    ).toBe(false);
  });

  it('commits COD holds, handles consumeOrderCoins replay after reservation removal, and claws back refunded rewards', async () => {
    const store = createInMemoryManager();
    const buyerId = randomUUID();
    const rewardedOrderId = randomUUID();

    await coins.grantPurchaseReward(
      store.manager,
      buyerId,
      rewardedOrderId,
      500,
      'EVIDENCE',
      now,
    );

    const checkout = {
      id: randomUUID(),
      buyerId,
      subtotal: 5000,
      expiresAt: new Date(now.getTime() + 600_000),
    };
    const codOrder = {
      id: randomUUID(),
      buyerId,
      coinDiscount: 300,
      coinMode: 'EVIDENCE' as const,
    };

    await coins.reserveCheckoutCoins(
      store.manager,
      checkout,
      300,
      'EVIDENCE',
      randomUUID(),
      now,
    );
    await coins.commitCodCoins(store.manager, checkout.id, [codOrder], now);
    expect(store.reservations).toEqual([
      expect.objectContaining({
        orderId: codOrder.id,
        state: 'COD',
        amount: 300,
        expiresAt: null,
      }),
    ]);

    const firstDebit = await coins.consumeOrderCoins(
      store.manager,
      codOrder,
      'EVIDENCE',
      now,
    );
    expect(store.reservations).toHaveLength(0);
    const replayDebit = await coins.consumeOrderCoins(
      store.manager,
      codOrder,
      'EVIDENCE',
      now,
    );
    expect(replayDebit?.id).toBe(firstDebit?.id);

    store.disputeRefunds.push({
      orderId: rewardedOrderId,
      mode: 'EVIDENCE',
      amount: 60000,
    } as DisputeRefundCredit);

    const adjusted = await adjustPurchaseReward(
      store.manager,
      {
        id: rewardedOrderId,
        buyerId,
        subtotal: 100000,
        coinDiscount: 0,
      } as Order,
      now,
    );
    expect(adjusted).toMatchObject({
      grantedAmount: 500,
      entitlement: 200,
      recoveredAmount: 200,
    });
    expect(store.accounts.get(buyerId)).toMatchObject({
      balance: 0,
      heldBalance: 0,
    });
  });

  it('advances evaluateDue() cursor past unfunded/null batches and resets at tail', async () => {
    const batchSize = ORDER_POLICY.SETTLEMENT_BATCH_SIZE;
    const firstBatch = Array.from({ length: batchSize }, (_, i) => ({
      id: `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
    }));
    const secondBatch = [{ id: '00000000-0000-0000-0000-000000000999' }];
    const seenCursors: (string | undefined)[] = [];
    let call = 0;

    const makeQb = () => {
      let currentCursor: string | undefined;
      const qb: any = {
        innerJoin: () => qb,
        leftJoin: () => qb,
        select: () => qb,
        where: () => qb,
        andWhere: (clause: unknown, params?: Record<string, any>) => {
          if (typeof clause === 'function') clause(qb);
          if (params?.cursor) currentCursor = params.cursor;
          return qb;
        },
        subQuery: () => qb,
        from: () => qb,
        getQuery: () => '(SELECT 1)',
        orderBy: () => qb,
        limit: () => qb,
        getRawMany: async () => {
          seenCursors.push(currentCursor);
          return call++ === 0 ? firstBatch : secondBatch;
        },
      };
      return qb;
    };

    const db = {
      manager: { createQueryBuilder: () => makeQb() },
    } as unknown as DataSource;
    const service = new CoinRewardService(db, coins);
    const evaluateSpy = jest.spyOn(service, 'evaluate').mockResolvedValue(null);

    await service.evaluateDue();
    await service.evaluateDue();
    await service.evaluateDue();

    expect(seenCursors).toEqual([
      undefined,
      firstBatch[firstBatch.length - 1].id,
      undefined,
    ]);
    expect(evaluateSpy).toHaveBeenCalledTimes(batchSize + 2);
  });

  it('exposes a non-overlapping public run() method on CoinRewardWorker without timers', async () => {
    const evaluateDue = jest.fn().mockResolvedValue(undefined);
    const worker = new CoinRewardWorker({ evaluateDue } as any);
    await worker.run();
    expect(evaluateDue).toHaveBeenCalledTimes(1);
  });
});
