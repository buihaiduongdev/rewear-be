import { BadRequestException, Injectable } from '@nestjs/common';

import { EntityManager, In } from 'typeorm';

import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';
import { Order } from '@/modules/order/entities/order.entity';

import { CoinProgramMistake } from '../programs/entities/coin-program.entity';
import { allocateLots } from './coin-allocation';
import {
  COIN_RELEASE_CAUSE,
  COIN_RESERVATION_STATE,
  COIN_SOURCE,
} from './constants/coin.constant';
import {
  CoinGrant,
  CoinMovement,
  CoinOrderDebit,
  CoinRecovery,
  CoinReservation,
  CoinSelection,
} from './entities/coin.entity';
import type {
  CoinCheckout,
  CoinOrder,
  CoinReleaseCause,
} from './types/coin.type';

@Injectable()
export class CoinService {
  private async lock(manager: EntityManager) {
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('Coin mutations require caller transaction');
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
  }

  private async movement(
    manager: EntityManager,
    grantId: string,
    kind: string,
    amount: number,
    referenceId: string | null,
  ) {
    if (amount)
      await manager.save(
        CoinMovement,
        manager.create(CoinMovement, { grantId, kind, amount, referenceId }),
      );
  }

  async reserveCheckoutCoins(
    manager: EntityManager,
    checkout: CoinCheckout,
    amount: number,
    mode: ReconciliationMode,
    requestId: string,
    now: Date,
  ) {
    await this.lock(manager);
    this.validAmount(amount);
    const prior = await manager.findOneBy(CoinSelection, {
      checkoutId: checkout.id,
      requestId,
    });
    if (prior) {
      if (!prior.active)
        throw new BadRequestException('Stale coin selection request');
      if (prior.amount !== amount || prior.mode !== mode)
        throw new BadRequestException('Coin request payload changed');
      return manager.findBy(CoinReservation, {
        checkoutId: checkout.id,
        state: COIN_RESERVATION_STATE.HELD,
      });
    }
    if (!checkout.expiresAt || checkout.expiresAt <= now)
      throw new BadRequestException('Checkout expired');
    const orders =
      checkout.subtotal === undefined
        ? await manager.findBy(Order, { checkoutId: checkout.id })
        : [];
    const subtotal =
      checkout.subtotal ??
      orders.reduce((sum, order) => sum + order.subtotal, 0);
    if (amount > Math.floor(subtotal / 10))
      throw new BadRequestException('Coins exceed 10% of merchandise subtotal');
    await this.releaseCheckoutCoins(manager, checkout.id, now);
    const grants = await manager.findBy(CoinGrant, {
      buyerId: checkout.buyerId,
      mode,
    });
    let allocations: { grantId: string; amount: number }[];
    try {
      allocations = allocateLots(grants, amount, now);
    } catch {
      throw new BadRequestException('Insufficient available coins');
    }
    const reservations: CoinReservation[] = [];
    for (const allocation of allocations) {
      const grant = grants.find((lot) => lot.id === allocation.grantId)!;
      grant.held += allocation.amount;
      await manager.save(grant);
      reservations.push(
        await manager.save(
          CoinReservation,
          manager.create(CoinReservation, {
            checkoutId: checkout.id,
            orderId: null,
            grantId: grant.id,
            amount: allocation.amount,
            state: COIN_RESERVATION_STATE.HELD,
            expiresAt: checkout.expiresAt,
          }),
        ),
      );
      await this.movement(
        manager,
        grant.id,
        'RESERVE',
        allocation.amount,
        checkout.id,
      );
    }
    await manager.update(
      CoinSelection,
      { checkoutId: checkout.id, active: true },
      { active: false },
    );
    await manager.save(
      CoinSelection,
      manager.create(CoinSelection, {
        checkoutId: checkout.id,
        requestId,
        amount,
        mode,
      }),
    );
    return reservations;
  }

  async releaseCheckoutCoins(
    manager: EntityManager,
    checkoutId: string,
    now: Date,
  ) {
    await this.lock(manager);
    const rows = await manager.findBy(CoinReservation, {
      checkoutId,
      state: COIN_RESERVATION_STATE.HELD,
    });
    for (const row of rows)
      await this.releaseReservation(
        manager,
        row,
        now,
        false,
        COIN_RELEASE_CAUSE.UNKNOWN,
      );
  }

  async consumeCheckoutCoins(
    manager: EntityManager,
    checkoutId: string,
    orders: CoinOrder[],
    mode: ReconciliationMode,
    now: Date,
  ) {
    await this.lock(manager);
    const rows = await manager.findBy(CoinReservation, {
      checkoutId,
      state: COIN_RESERVATION_STATE.HELD,
    });
    if (!rows.length) {
      for (const order of orders) await this.verifyDebit(manager, order, mode);
      return;
    }
    if (rows.some((row) => !row.expiresAt || row.expiresAt <= now))
      throw new BadRequestException('Coin checkout reservation expired');
    await this.splitReservations(
      manager,
      checkoutId,
      orders,
      rows,
      mode,
      COIN_RESERVATION_STATE.HELD,
    );
    for (const order of orders)
      await this.consumeOrderCoins(manager, order, mode, now);
  }

  async commitCodCoins(
    manager: EntityManager,
    checkoutId: string,
    orders: CoinOrder[],
    now: Date,
  ) {
    await this.lock(manager);
    const rows = await manager.findBy(CoinReservation, {
      checkoutId,
      state: COIN_RESERVATION_STATE.HELD,
    });
    if (!rows.length) {
      const committed = await manager.findBy(CoinReservation, {
        checkoutId,
        orderId: In(orders.map((order) => order.id)),
        state: In([
          COIN_RESERVATION_STATE.COD,
          COIN_RESERVATION_STATE.CONSUMED,
          COIN_RESERVATION_STATE.RELEASED,
          COIN_RESERVATION_STATE.PENDING_CAUSE,
        ]),
      });
      if (
        committed.reduce((sum, row) => sum + row.amount, 0) !==
        orders.reduce((sum, order) => sum + (order.coinDiscount ?? 0), 0)
      )
        throw new BadRequestException('COD coin reservation mismatch');
      return;
    }
    if (rows.some((row) => !row.expiresAt || row.expiresAt <= now))
      throw new BadRequestException('Coin checkout reservation expired');
    const grant = await manager.findOneByOrFail(CoinGrant, {
      id: rows[0].grantId,
    });
    await this.splitReservations(
      manager,
      checkoutId,
      orders,
      rows,
      grant.mode,
      COIN_RESERVATION_STATE.COD,
    );
  }

  private async splitReservations(
    manager: EntityManager,
    checkoutId: string,
    orders: CoinOrder[],
    rows: CoinReservation[],
    mode: ReconciliationMode,
    state: 'COD' | 'HELD',
  ) {
    const expected = orders.reduce(
      (sum, order) => sum + (order.coinDiscount ?? 0),
      0,
    );
    if (expected !== rows.reduce((sum, row) => sum + row.amount, 0))
      throw new BadRequestException('Coin allocation does not match checkout');
    const sorted = [...rows].sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
    let index = 0;
    let remaining = sorted[0]?.amount ?? 0;
    for (const order of [...orders].sort((a, b) => a.id.localeCompare(b.id))) {
      let needed = order.coinDiscount ?? 0;
      this.validAmount(needed);
      while (needed > 0) {
        const original = sorted[index];
        const grant = await manager.findOneByOrFail(CoinGrant, {
          id: original.grantId,
        });
        if (grant.buyerId !== order.buyerId || grant.mode !== mode)
          throw new BadRequestException('Coin source does not match order');
        const amount = Math.min(needed, remaining);
        await manager.save(
          CoinReservation,
          manager.create(CoinReservation, {
            checkoutId,
            orderId: order.id,
            grantId: original.grantId,
            amount,
            state,
            expiresAt:
              state === COIN_RESERVATION_STATE.COD ? null : original.expiresAt,
          }),
        );
        needed -= amount;
        remaining -= amount;
        if (!remaining) {
          index++;
          remaining = sorted[index]?.amount ?? 0;
        }
      }
    }
    // Original rows retain immutable allocation evidence but no longer own held balances.
    for (const row of rows) {
      row.state = COIN_RESERVATION_STATE.RELEASED;
      await manager.save(row);
    }
  }

  private async verifyDebit(
    manager: EntityManager,
    order: CoinOrder,
    mode: ReconciliationMode,
  ) {
    const debit = await manager.findOneBy(CoinOrderDebit, {
      orderId: order.id,
    });
    if ((order.coinDiscount ?? 0) === 0 && !debit) return;
    if (
      !debit ||
      debit.amount !== order.coinDiscount ||
      debit.buyerId !== order.buyerId ||
      debit.mode !== mode
    )
      throw new BadRequestException('Coin debit proof mismatch');
  }

  async consumeOrderCoins(
    manager: EntityManager,
    order: CoinOrder,
    mode: ReconciliationMode,
    now: Date,
  ) {
    await this.lock(manager);
    if (order.coinMode && order.coinMode !== mode)
      throw new BadRequestException('Coin order mode mismatch');
    const prior = await manager.findOneBy(CoinOrderDebit, {
      orderId: order.id,
    });
    if (prior) {
      await this.verifyDebit(manager, order, mode);
      return prior;
    }
    const rows = await manager.findBy(CoinReservation, {
      orderId: order.id,
      state: In([COIN_RESERVATION_STATE.COD, COIN_RESERVATION_STATE.HELD]),
    });
    if (
      rows.some(
        (row) =>
          row.state === COIN_RESERVATION_STATE.HELD &&
          (!row.expiresAt || row.expiresAt <= now),
      )
    )
      throw new BadRequestException('Coin checkout reservation expired');
    const amount = order.coinDiscount ?? 0;
    if (amount !== rows.reduce((sum, row) => sum + row.amount, 0))
      throw new BadRequestException('Coin order reservation mismatch');
    if (!amount) return null;
    const allocations: {
      grantId: string;
      rootGrantId: string;
      amount: number;
    }[] = [];
    for (const row of rows) {
      const grant = await manager.findOneByOrFail(CoinGrant, {
        id: row.grantId,
      });
      if (grant.mode !== mode || grant.buyerId !== order.buyerId)
        throw new BadRequestException('Coin debit source mismatch');
      grant.held -= row.amount;
      grant.spent += row.amount;
      await manager.save(grant);
      row.state = COIN_RESERVATION_STATE.CONSUMED;
      await manager.save(row);
      allocations.push({
        grantId: grant.id,
        rootGrantId: grant.rootGrantId ?? grant.id,
        amount: row.amount,
      });
      await this.movement(manager, grant.id, 'CONSUME', row.amount, order.id);
      await this.updateMistakeExpense(manager, grant.rootGrantId ?? grant.id);
    }
    return manager.save(
      CoinOrderDebit,
      manager.create(CoinOrderDebit, {
        orderId: order.id,
        buyerId: order.buyerId,
        mode,
        amount,
        allocations,
      }),
    );
  }

  async releaseOrderCoins(
    manager: EntityManager,
    order: CoinOrder,
    cause: CoinReleaseCause,
    now: Date,
  ) {
    await this.lock(manager);
    const rows = await manager.findBy(CoinReservation, {
      orderId: order.id,
      state: In([
        COIN_RESERVATION_STATE.COD,
        COIN_RESERVATION_STATE.PENDING_CAUSE,
      ]),
    });
    for (const row of rows)
      await this.releaseReservation(manager, row, now, true, cause);
  }

  private async releaseReservation(
    manager: EntityManager,
    row: CoinReservation,
    now: Date,
    cod: boolean,
    cause: CoinReleaseCause,
  ) {
    const grant = await manager.findOneByOrFail(CoinGrant, { id: row.grantId });
    const expired = !!grant.expiresAt && grant.expiresAt <= now;
    if (expired && cod && cause === COIN_RELEASE_CAUSE.UNKNOWN) {
      row.state = COIN_RESERVATION_STATE.PENDING_CAUSE;
      await manager.save(row);
      return;
    }
    grant.held -= row.amount;
    row.state = COIN_RESERVATION_STATE.RELEASED;
    await manager.save(row);
    const root = grant.rootGrantId
      ? await manager.findOneByOrFail(CoinGrant, { id: grant.rootGrantId })
      : grant;
    const recovery = await manager.findOneBy(CoinRecovery, {
      grantId: root.id,
    });
    const lineage = await manager.find(CoinGrant, {
      where: [{ id: root.id }, { rootGrantId: root.id }],
    });
    const recoveredTotal = lineage.reduce((sum, lot) => sum + lot.recovered, 0);
    const recoverable = Math.min(
      row.amount,
      recovery
        ? Math.max(0, recovery.target - recovery.collected)
        : Math.max(0, root.recoveryTarget - recoveredTotal),
    );
    if (recoverable > 0) {
      grant.recovered += recoverable;
      if (recovery) {
        recovery.collected += recoverable;
        await manager.save(recovery);
      }
      await this.movement(
        manager,
        grant.id,
        'RECOVER_RELEASE',
        recoverable,
        row.orderId ?? row.checkoutId,
      );
    }
    const remainder = row.amount - recoverable;
    const restore =
      expired &&
      cod &&
      remainder > 0 &&
      ((
        [
          COIN_RELEASE_CAUSE.SELLER,
          COIN_RELEASE_CAUSE.CARRIER,
          COIN_RELEASE_CAUSE.INCONCLUSIVE,
        ] as readonly CoinReleaseCause[]
      ).includes(cause) ||
        (cause === COIN_RELEASE_CAUSE.BUYER_CHANGE && !root.buyerRestored));
    if (restore) {
      grant.transferred += remainder; // transfer out of expired parent, never extend its expiry
      if (cause === COIN_RELEASE_CAUSE.BUYER_CHANGE) root.buyerRestored = true;
      if (root.id !== grant.id) await manager.save(root);
      const child = await manager.save(
        CoinGrant,
        manager.create(CoinGrant, {
          buyerId: grant.buyerId,
          mode: grant.mode,
          source: COIN_SOURCE.RESTORATION,
          sourceId: row.id,
          rootGrantId: root.id,
          parentGrantId: grant.id,
          amount: remainder,
          held: 0,
          spent: 0,
          recovered: 0,
          recoveryTarget: Math.max(0, grant.recoveryTarget - grant.recovered),
          buyerRestored: false,
          expiresAt: new Date(now.getTime() + 7 * 86400000),
        }),
      );
      await this.movement(manager, child.id, 'RESTORE', remainder, row.orderId);
    }
    await manager.save(grant);
    await this.updateMistakeExpense(manager, root.id);
    await this.movement(
      manager,
      grant.id,
      'RELEASE',
      row.amount,
      row.orderId ?? row.checkoutId,
    );
  }

  async grantPurchaseReward(
    manager: EntityManager,
    buyerId: string,
    orderId: string,
    amount: number,
    mode: ReconciliationMode,
    _now: Date,
  ) {
    await this.lock(manager);
    this.validAmount(amount);
    const prior = await manager.findOneBy(CoinGrant, {
      source: COIN_SOURCE.PURCHASE,
      sourceId: orderId,
      buyerId,
    });
    if (prior) {
      if (prior.amount !== amount || prior.mode !== mode)
        throw new BadRequestException('Purchase grant amount or mode changed');
      return prior;
    }
    const grant = await manager.save(
      CoinGrant,
      manager.create(CoinGrant, {
        buyerId,
        mode,
        source: COIN_SOURCE.PURCHASE,
        sourceId: orderId,
        rootGrantId: null,
        parentGrantId: null,
        amount,
        held: 0,
        spent: 0,
        recovered: 0,
        recoveryTarget: 0,
        buyerRestored: false,
        expiresAt: null,
      }),
    );
    const recoveries = await manager.find(CoinRecovery, {
      where: { buyerId, mode },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    for (const recovery of recoveries) {
      const take = Math.min(
        amount - grant.recovered,
        recovery.target - recovery.collected,
      );
      if (take <= 0) continue;
      grant.recovered += take;
      recovery.collected += take;
      await manager.save(recovery);
      await this.movement(
        manager,
        grant.id,
        'RECOVER_FUTURE_PURCHASE',
        take,
        recovery.id,
      );
    }
    await manager.save(grant);
    await this.movement(manager, grant.id, 'PURCHASE_GRANT', amount, orderId);
    return grant;
  }

  async recoverPurchaseReward(
    manager: EntityManager,
    grantId: string,
    targetEntitlement: number,
    now: Date,
  ) {
    await this.lock(manager);
    this.validAmount(targetEntitlement);
    const grant = await manager.findOneByOrFail(CoinGrant, { id: grantId });
    if (
      grant.source !== COIN_SOURCE.PURCHASE ||
      targetEntitlement > grant.amount
    )
      throw new BadRequestException('Invalid purchase recovery');
    let recovery = await manager.findOneBy(CoinRecovery, { grantId });
    const target = grant.amount - targetEntitlement;
    if (recovery && target < recovery.target)
      throw new BadRequestException('Recovery entitlement cannot increase');
    recovery ??= manager.create(CoinRecovery, {
      grantId,
      buyerId: grant.buyerId,
      mode: grant.mode,
      target,
      collected: 0,
    });
    recovery.target = target;
    grant.recoveryTarget = target;
    await manager.save(grant);
    const related = await manager.find(CoinGrant, {
      where: [{ id: grantId }, { rootGrantId: grantId }],
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    for (const lot of related) {
      if (lot.expiresAt && lot.expiresAt <= now) continue;
      const take = Math.min(
        recovery.target - recovery.collected,
        lot.amount -
          lot.held -
          lot.spent -
          lot.recovered -
          (lot.transferred ?? 0),
      );
      lot.recoveryTarget = Math.max(
        lot.recoveryTarget,
        lot.recovered + Math.max(0, recovery.target - recovery.collected),
      );
      if (take > 0) {
        lot.recovered += take;
        recovery.collected += take;
        await this.movement(manager, lot.id, 'RECOVER_PURCHASE', take, grantId);
      }
      await manager.save(lot);
    }
    return manager.save(recovery);
  }

  private async updateMistakeExpense(
    manager: EntityManager,
    rootGrantId: string,
  ) {
    const mistake = await manager.findOneBy(CoinProgramMistake, {
      grantId: rootGrantId,
    });
    if (!mistake) return;
    const lineage = await manager.find(CoinGrant, {
      where: [{ id: rootGrantId }, { rootGrantId }],
    });
    const recovered = lineage.reduce((sum, lot) => sum + lot.recovered, 0);
    const spent = lineage.reduce((sum, lot) => sum + lot.spent, 0);
    mistake.platformExpense = Math.min(
      Math.max(0, mistake.target - recovered),
      spent,
    );
    await manager.save(mistake);
  }

  private validAmount(amount: number) {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647)
      throw new BadRequestException('Invalid coin amount');
  }
}

export const grantPurchaseReward = (
  manager: EntityManager,
  buyerId: string,
  orderId: string,
  amount: number,
  mode: ReconciliationMode,
  now: Date,
) =>
  new CoinService().grantPurchaseReward(
    manager,
    buyerId,
    orderId,
    amount,
    mode,
    now,
  );
export const recoverPurchaseReward = (
  manager: EntityManager,
  grantId: string,
  targetEntitlement: number,
  now: Date,
) =>
  new CoinService().recoverPurchaseReward(
    manager,
    grantId,
    targetEntitlement,
    now,
  );
