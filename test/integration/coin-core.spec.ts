import { randomUUID } from 'node:crypto';

import { CoinService } from '@/modules/coins/core/coin.service';
import {
  CoinGrant,
  CoinOrderDebit,
  CoinRecovery,
  CoinReservation,
} from '@/modules/coins/core/entities/coin.entity';
import { CoinProgramService } from '@/modules/coins/programs/coin-program.service';
import { CoinProgramMistake } from '@/modules/coins/programs/entities/coin-program.entity';
import { CoinProgram } from '@/modules/coins/programs/entities/coin-program.entity';

import { createTestDatabase, TestDatabase } from '../support/database';

describe('Coin lots and program accounting (PostgreSQL)', () => {
  let database: TestDatabase;
  const coins = new CoinService();
  const programs = new CoinProgramService();
  const now = new Date('2026-11-21T00:00:00Z');
  beforeAll(async () => {
    database = await createTestDatabase();
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
  it('isolates source modes, preserves checkout deadline, and burns exactly once with order evidence', async () => {
    const buyerId = randomUUID(),
      checkoutId = randomUUID();
    await grant(buyerId, 100, 'SIMULATION');
    const checkout = {
      id: checkoutId,
      buyerId,
      expiresAt: new Date(now.getTime() + 600000),
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
    const lot = await grant(buyerId);
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
    };
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
    });
    expect(
      (
        await database.dataSource.manager.findOneByOrFail(CoinGrant, {
          id: lot.id,
        })
      ).spent,
    ).toBe(50);
    expect(
      await database.dataSource.manager.countBy(CoinOrderDebit, {
        orderId: order.id,
      }),
    ).toBe(1);
  });
  it('recovers held original reward on release before unrelated program coins or wallet funds', async () => {
    const buyerId = randomUUID(),
      lot = await grant(buyerId);
    const checkout = {
      id: randomUUID(),
      buyerId,
      expiresAt: new Date(now.getTime() + 600000),
      subtotal: 1000,
    };
    await database.dataSource.transaction(async (manager) => {
      await coins.reserveCheckoutCoins(
        manager,
        checkout,
        80,
        'EVIDENCE',
        randomUUID(),
        now,
      );
      const recovery = await coins.recoverPurchaseReward(
        manager,
        lot.id,
        20,
        now,
      );
      expect(recovery.collected).toBe(20);
      await coins.releaseCheckoutCoins(manager, checkout.id, now);
    });
    const recovered = await database.dataSource.manager.findOneByOrFail(
      CoinRecovery,
      { grantId: lot.id },
    );
    expect(recovered.collected).toBe(80);
    expect(
      (
        await database.dataSource.manager.findOneByOrFail(CoinGrant, {
          id: lot.id,
        })
      ).held,
    ).toBe(0);
  });
  it('restores expired COD once for buyer change and carries original lineage', async () => {
    const buyerId = randomUUID(),
      lot = await grant(buyerId);
    await database.dataSource.manager.update(CoinGrant, lot.id, {
      expiresAt: new Date(now.getTime() + 1000),
    });
    const checkout = {
      id: randomUUID(),
      buyerId,
      expiresAt: new Date(now.getTime() + 600000),
      subtotal: 1000,
    };
    const order = { id: randomUUID(), buyerId, coinDiscount: 100 };
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
      await coins.releaseOrderCoins(
        manager,
        order,
        'UNKNOWN',
        new Date(now.getTime() + 2000),
      );
      expect(
        await manager.countBy(CoinReservation, {
          orderId: order.id,
          state: 'PENDING_CAUSE',
        }),
      ).toBe(1);
      await coins.releaseOrderCoins(
        manager,
        order,
        'BUYER_CHANGE',
        new Date(now.getTime() + 3000),
      );
    });
    const child = await database.dataSource.manager.findOneByOrFail(CoinGrant, {
      parentGrantId: lot.id,
    });
    expect(child.rootGrantId).toBe(lot.id);
    expect(child.expiresAt?.getTime()).toBe(
      now.getTime() + 3000 + 7 * 86400000,
    );
    expect(
      (
        await database.dataSource.manager.findOneByOrFail(CoinGrant, {
          id: lot.id,
        })
      ).buyerRestored,
    ).toBe(true);
  });
  it('rejects complete overbudget batches, duplicate recipients, and never replenishes cumulative issuance', async () => {
    const actor = randomUUID(),
      buyerId = randomUUID();
    const program = await database.dataSource.transaction((manager) =>
      programs.createProgram(
        manager,
        {
          name: 'Launch',
          reason: 'Launch reward',
          audience: 'Buyers',
          budget: 100,
          mode: 'EVIDENCE',
          expiresAt: null,
        },
        actor,
        now,
      ),
    );
    await database.dataSource.transaction((manager) =>
      programs.activateProgram(manager, program.id, actor, 'Ready', now),
    );
    const requestId = randomUUID();
    const ids = await database.dataSource.transaction((manager) =>
      programs.issueProgramCoins(
        manager,
        program.id,
        requestId,
        [{ buyerId, amount: 70 }],
        actor,
        'Approved recipients',
        now,
      ),
    );
    const replay = await database.dataSource.transaction((manager) =>
      programs.issueProgramCoins(
        manager,
        program.id,
        requestId,
        [{ buyerId, amount: 70 }],
        actor,
        'Approved recipients',
        now,
      ),
    );
    expect(replay).toEqual(ids);
    await expect(
      database.dataSource.transaction((manager) =>
        programs.issueProgramCoins(
          manager,
          program.id,
          randomUUID(),
          [{ buyerId: randomUUID(), amount: 31 }],
          actor,
          'Too much',
          now,
        ),
      ),
    ).rejects.toThrow('budget exceeded');
    await database.dataSource.transaction((manager) =>
      programs.recoverProgramMistake(
        manager,
        ids.grantIds[0],
        70,
        actor,
        'Verified duplicate import',
      ),
    );
    expect(
      (
        await database.dataSource.manager.findOneByOrFail(CoinProgram, {
          id: program.id,
        })
      ).issued,
    ).toBe(70);
    await expect(
      database.dataSource.transaction((manager) =>
        programs.issueProgramCoins(
          manager,
          program.id,
          randomUUID(),
          [{ buyerId, amount: 10 }],
          actor,
          'Duplicate',
          now,
        ),
      ),
    ).rejects.toThrow('already received');
  });
  it('rejects stale selection replay and preserves the exact selection hold', async () => {
    const buyerId = randomUUID();
    await grant(buyerId);
    const checkout = {
      id: randomUUID(),
      buyerId,
      subtotal: 1000,
      expiresAt: new Date(now.getTime() + 600000),
    };
    const first = randomUUID();
    await database.dataSource.transaction((manager) =>
      coins.reserveCheckoutCoins(manager, checkout, 10, 'EVIDENCE', first, now),
    );
    await database.dataSource.transaction((manager) =>
      coins.reserveCheckoutCoins(
        manager,
        checkout,
        20,
        'EVIDENCE',
        randomUUID(),
        now,
      ),
    );
    await expect(
      database.dataSource.transaction((manager) =>
        coins.reserveCheckoutCoins(
          manager,
          checkout,
          10,
          'EVIDENCE',
          first,
          now,
        ),
      ),
    ).rejects.toThrow('Stale');
    const held = await database.dataSource.manager.findBy(CoinReservation, {
      checkoutId: checkout.id,
      state: 'HELD',
    });
    expect(held.reduce((sum, row) => sum + row.amount, 0)).toBe(20);
    expect(
      held.every(
        (row) => row.expiresAt!.getTime() === checkout.expiresAt.getTime(),
      ),
    ).toBe(true);
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
  });
  it('offsets future purchase grants while leaving existing unrelated purchasing power untouched', async () => {
    const buyerId = randomUUID(),
      original = await grant(buyerId, 100);
    const checkout = {
      id: randomUUID(),
      buyerId,
      subtotal: 1000,
      expiresAt: new Date(now.getTime() + 600000),
    };
    const order = { id: randomUUID(), buyerId, coinDiscount: 100 };
    await database.dataSource.transaction(async (manager) => {
      await coins.reserveCheckoutCoins(
        manager,
        checkout,
        100,
        'EVIDENCE',
        randomUUID(),
        now,
      );
      await coins.consumeCheckoutCoins(
        manager,
        checkout.id,
        [order],
        'EVIDENCE',
        now,
      );
    });
    const unrelated = await grant(buyerId, 70);
    await database.dataSource.transaction((manager) =>
      coins.recoverPurchaseReward(manager, original.id, 0, now),
    );
    expect(
      (
        await database.dataSource.manager.findOneByOrFail(CoinGrant, {
          id: unrelated.id,
        })
      ).recovered,
    ).toBe(0);
    const future = await grant(buyerId, 40);
    expect(future.recovered).toBe(40);
    const simulated = await grant(buyerId, 100, 'SIMULATION');
    expect(simulated.recovered).toBe(0);
    const recovery = await database.dataSource.manager.findOneByOrFail(
      CoinRecovery,
      { grantId: original.id },
    );
    expect(recovery.target - recovery.collected).toBe(60);
  });
  it('collects promotion mistakes on release and keeps held checkout prices unchanged', async () => {
    const buyerId = randomUUID(),
      actor = randomUUID();
    const program = await database.dataSource.transaction((manager) =>
      programs.createProgram(
        manager,
        {
          name: 'Mistake test',
          reason: 'Campaign',
          audience: 'Buyers',
          budget: 100,
          mode: 'EVIDENCE',
          expiresAt: null,
        },
        actor,
        now,
      ),
    );
    const batch = await database.dataSource.transaction(async (manager) => {
      await programs.activateProgram(manager, program.id, actor, 'Start', now);
      return programs.issueProgramCoins(
        manager,
        program.id,
        randomUUID(),
        [{ buyerId, amount: 100 }],
        actor,
        'Issue',
        now,
      );
    });
    const checkout = {
      id: randomUUID(),
      buyerId,
      subtotal: 1000,
      expiresAt: new Date(now.getTime() + 600000),
    };
    await database.dataSource.transaction(async (manager) => {
      await coins.reserveCheckoutCoins(
        manager,
        checkout,
        80,
        'EVIDENCE',
        randomUUID(),
        now,
      );
      await programs.recoverProgramMistake(
        manager,
        batch.grantIds[0],
        100,
        actor,
        'Verified mistaken import',
      );
      const held = await manager.findOneByOrFail(CoinGrant, {
        id: batch.grantIds[0],
      });
      expect(held.held).toBe(80);
      expect(held.recovered).toBe(20);
      await coins.releaseCheckoutCoins(manager, checkout.id, now);
    });
    const lot = await database.dataSource.manager.findOneByOrFail(CoinGrant, {
      id: batch.grantIds[0],
    });
    expect(lot.recovered).toBe(100);
    expect(lot.held).toBe(0);
  });
  it('reconciles platform mistake expense when a partial correction is recovered from released holds', async () => {
    const buyerId = randomUUID(),
      actor = randomUUID();
    const program = await database.dataSource.transaction((manager) =>
      programs.createProgram(
        manager,
        {
          name: 'Partial correction',
          reason: 'Campaign',
          audience: 'Buyers',
          budget: 100,
          mode: 'EVIDENCE',
          expiresAt: null,
        },
        actor,
        now,
      ),
    );
    const batch = await database.dataSource.transaction(async (manager) => {
      await programs.activateProgram(manager, program.id, actor, 'Start', now);
      return programs.issueProgramCoins(
        manager,
        program.id,
        randomUUID(),
        [{ buyerId, amount: 100 }],
        actor,
        'Issue',
        now,
      );
    });
    const first = {
      id: randomUUID(),
      buyerId,
      subtotal: 1000,
      expiresAt: new Date(now.getTime() + 600000),
    };
    const second = { ...first, id: randomUUID() };
    await database.dataSource.transaction(async (manager) => {
      await coins.reserveCheckoutCoins(
        manager,
        first,
        50,
        'EVIDENCE',
        randomUUID(),
        now,
      );
      await coins.consumeCheckoutCoins(
        manager,
        first.id,
        [{ id: randomUUID(), buyerId, coinDiscount: 50 }],
        'EVIDENCE',
        now,
      );
      await coins.reserveCheckoutCoins(
        manager,
        second,
        50,
        'EVIDENCE',
        randomUUID(),
        now,
      );
      const mistake = await programs.recoverProgramMistake(
        manager,
        batch.grantIds[0],
        50,
        actor,
        'Verified partial excess',
      );
      expect(mistake.platformExpense).toBe(50);
      await coins.releaseCheckoutCoins(manager, second.id, now);
    });
    const mistake = await database.dataSource.manager.findOneByOrFail(
      CoinProgramMistake,
      { grantId: batch.grantIds[0] },
    );
    const lot = await database.dataSource.manager.findOneByOrFail(CoinGrant, {
      id: batch.grantIds[0],
    });
    expect(mistake.platformExpense).toBe(0);
    expect(lot.spent).toBe(50);
    expect(lot.recovered).toBe(50);
  });
});
