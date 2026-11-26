import { BadRequestException, Injectable, Optional } from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { Order } from '@/modules/order/entities';

import { COIN_POLICY, COIN_RESERVATION_STATE } from './constants/coin.constant';
import {
  CoinAccount,
  CoinOrderDebit,
  CoinPurchaseReward,
  CoinReservation,
} from './entities';
import type {
  CoinCheckout,
  CoinHistoryQueryInput,
  CoinOrder,
} from './schemas/coin.schema';

@Injectable()
export class CoinService {
  constructor(@Optional() private readonly db?: DataSource) {}

  private assertTransaction(manager: EntityManager) {
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('Coin mutations require caller transaction');
  }

  private balanceFields(mode: ReconciliationMode) {
    return mode === 'SIMULATION'
      ? ({
          available: 'simulationBalance',
          held: 'simulationHeldBalance',
        } as const)
      : ({ available: 'balance', held: 'heldBalance' } as const);
  }

  private async lockAccount(manager: EntityManager, userId: string) {
    await manager
      .createQueryBuilder()
      .insert()
      .into(CoinAccount)
      .values({ userId })
      .orIgnore()
      .execute();
    return manager.findOneOrFail(CoinAccount, {
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  async balance(userId: string) {
    if (!this.db) throw new Error('DataSource is required');
    const account = await this.db.manager.findOneBy(CoinAccount, { userId });
    return {
      balance: account?.balance ?? 0,
      heldBalance: account?.heldBalance ?? 0,
      simulationBalance: account?.simulationBalance ?? 0,
      simulationHeldBalance: account?.simulationHeldBalance ?? 0,
    };
  }

  async history(userId: string, query: Partial<CoinHistoryQueryInput> = {}) {
    if (!this.db) throw new Error('DataSource is required');
    const take = query.limit ?? 50;
    const skip = query.offset ?? 0;
    const [rewards, debits] = await Promise.all([
      this.db.manager.find(CoinPurchaseReward, {
        where: { buyerId: userId },
        order: { createdAt: 'DESC', id: 'DESC' },
        take,
        skip,
      }),
      this.db.manager.find(CoinOrderDebit, {
        where: { buyerId: userId },
        order: { createdAt: 'DESC', id: 'DESC' },
        take,
        skip,
      }),
    ]);
    return { rewards, debits };
  }

  async reserveCheckoutCoins(
    manager: EntityManager,
    checkout: CoinCheckout,
    amount: number,
    mode: ReconciliationMode,
    _requestId: string,
    now: Date,
  ) {
    this.assertTransaction(manager);
    this.validAmount(amount);
    if (!checkout.expiresAt || checkout.expiresAt <= now)
      throw new BadRequestException('Checkout expired');
    const orders =
      checkout.subtotal === undefined
        ? await manager.findBy(Order, { checkoutId: checkout.id })
        : [];
    const subtotal =
      checkout.subtotal ??
      orders.reduce((sum, order) => sum + order.subtotal, 0);
    if (amount > Math.floor(subtotal / COIN_POLICY.SUBTOTAL_LIMIT_DIVISOR))
      throw new BadRequestException('Coins exceed 10% of merchandise subtotal');
    await this.releaseCheckoutCoins(manager, checkout.id, now);
    if (amount === 0) return [];
    const account = await this.lockAccount(manager, checkout.buyerId);
    const fields = this.balanceFields(mode);
    if (account[fields.available] < amount)
      throw new BadRequestException('Insufficient available coins');
    account[fields.available] -= amount;
    account[fields.held] += amount;
    await manager.save(CoinAccount, account);
    const reservation = await manager.save(
      CoinReservation,
      manager.create(CoinReservation, {
        checkoutId: checkout.id,
        orderId: null,
        buyerId: checkout.buyerId,
        mode,
        amount,
        state: COIN_RESERVATION_STATE.HELD,
        expiresAt: checkout.expiresAt,
      }),
    );
    return [reservation];
  }

  async releaseCheckoutCoins(
    manager: EntityManager,
    checkoutId: string,
    _now?: Date,
  ) {
    this.assertTransaction(manager);
    const rows = await manager.find(CoinReservation, {
      where: { checkoutId, state: COIN_RESERVATION_STATE.HELD },
      lock: { mode: 'pessimistic_write' },
    });
    if (!rows.length) return;
    for (const row of rows) {
      const account = await this.lockAccount(manager, row.buyerId);
      const fields = this.balanceFields(row.mode);
      account[fields.held] -= row.amount;
      account[fields.available] += row.amount;
      await manager.save(CoinAccount, account);
    }
    await manager.remove(CoinReservation, rows);
  }

  async consumeCheckoutCoins(
    manager: EntityManager,
    checkoutId: string,
    orders: CoinOrder[],
    mode: ReconciliationMode,
    now: Date,
  ) {
    this.assertTransaction(manager);
    const rows = await manager.find(CoinReservation, {
      where: { checkoutId, state: COIN_RESERVATION_STATE.HELD },
      lock: { mode: 'pessimistic_write' },
    });
    if (!rows.length) {
      for (const order of orders) await this.verifyDebit(manager, order, mode);
      return;
    }
    if (rows.some((row) => !row.expiresAt || row.expiresAt <= now))
      throw new BadRequestException('Coin checkout reservation expired');
    const heldAmount = rows.reduce((sum, row) => sum + row.amount, 0);
    const expected = orders.reduce(
      (sum, order) => sum + (order.coinDiscount ?? 0),
      0,
    );
    if (expected !== heldAmount)
      throw new BadRequestException('Coin allocation does not match checkout');
    const buyerId = rows[0].buyerId;
    if (
      rows.some((row) => row.buyerId !== buyerId || row.mode !== mode) ||
      orders.some(
        (order) =>
          order.buyerId !== buyerId ||
          (order.coinMode && order.coinMode !== mode),
      )
    )
      throw new BadRequestException('Coin source does not match order');

    const account = await this.lockAccount(manager, buyerId);
    const fields = this.balanceFields(mode);
    account[fields.held] -= heldAmount;
    await manager.save(CoinAccount, account);
    await manager.remove(CoinReservation, rows);

    for (const order of orders) {
      const amount = order.coinDiscount ?? 0;
      this.validAmount(amount);
      if (!amount) continue;
      await manager.save(
        CoinOrderDebit,
        manager.create(CoinOrderDebit, {
          orderId: order.id,
          buyerId,
          mode,
          amount,
        }),
      );
    }
  }

  async commitCodCoins(
    manager: EntityManager,
    checkoutId: string,
    orders: CoinOrder[],
    now: Date,
  ) {
    this.assertTransaction(manager);
    const rows = await manager.find(CoinReservation, {
      where: { checkoutId, state: COIN_RESERVATION_STATE.HELD },
      lock: { mode: 'pessimistic_write' },
    });
    const expected = orders.reduce(
      (sum, order) => sum + (order.coinDiscount ?? 0),
      0,
    );
    if (!rows.length) {
      if (expected === 0) return;
      const orderIds = orders.map((order) => order.id);
      const [committed, debits] = await Promise.all([
        manager.findBy(CoinReservation, {
          checkoutId,
          orderId: In(orderIds),
          state: In([
            COIN_RESERVATION_STATE.COD,
            COIN_RESERVATION_STATE.RELEASED,
          ]),
        }),
        manager.findBy(CoinOrderDebit, {
          orderId: In(orderIds),
        }),
      ]);
      const total =
        committed.reduce((sum, row) => sum + row.amount, 0) +
        debits.reduce((sum, row) => sum + row.amount, 0);
      if (total !== expected)
        throw new BadRequestException('COD coin reservation mismatch');
      return;
    }
    if (rows.some((row) => !row.expiresAt || row.expiresAt <= now))
      throw new BadRequestException('Coin checkout reservation expired');
    const heldAmount = rows.reduce((sum, row) => sum + row.amount, 0);
    if (expected !== heldAmount)
      throw new BadRequestException('Coin allocation does not match checkout');
    const { buyerId, mode } = rows[0];
    if (
      rows.some((row) => row.buyerId !== buyerId || row.mode !== mode) ||
      orders.some(
        (order) =>
          order.buyerId !== buyerId ||
          (order.coinMode && order.coinMode !== mode),
      )
    )
      throw new BadRequestException('Coin source does not match order');

    await manager.remove(CoinReservation, rows);
    for (const order of orders) {
      const amount = order.coinDiscount ?? 0;
      this.validAmount(amount);
      if (!amount) continue;
      await manager.save(
        CoinReservation,
        manager.create(CoinReservation, {
          checkoutId,
          orderId: order.id,
          buyerId,
          mode,
          amount,
          state: COIN_RESERVATION_STATE.COD,
          expiresAt: null,
        }),
      );
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
    this.assertTransaction(manager);
    if (order.coinMode && order.coinMode !== mode)
      throw new BadRequestException('Coin order mode mismatch');
    const amount = order.coinDiscount ?? 0;
    this.validAmount(amount);
    const rows = await manager.find(CoinReservation, {
      where: {
        orderId: order.id,
        state: In([COIN_RESERVATION_STATE.COD, COIN_RESERVATION_STATE.HELD]),
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!rows.length) {
      const prior = await manager.findOneBy(CoinOrderDebit, {
        orderId: order.id,
      });
      if (prior) {
        await this.verifyDebit(manager, order, mode);
        return prior;
      }
      if (!amount) return null;
      throw new BadRequestException('Coin order reservation mismatch');
    }
    if (
      rows.some(
        (row) =>
          row.state === COIN_RESERVATION_STATE.HELD &&
          (!row.expiresAt || row.expiresAt <= now),
      )
    )
      throw new BadRequestException('Coin checkout reservation expired');
    if (amount !== rows.reduce((sum, row) => sum + row.amount, 0))
      throw new BadRequestException('Coin order reservation mismatch');
    if (!amount) return null;
    if (rows.some((row) => row.mode !== mode || row.buyerId !== order.buyerId))
      throw new BadRequestException('Coin debit source mismatch');

    const account = await this.lockAccount(manager, order.buyerId);
    const fields = this.balanceFields(mode);
    account[fields.held] -= amount;
    await manager.save(CoinAccount, account);
    await manager.remove(CoinReservation, rows);
    return manager.save(
      CoinOrderDebit,
      manager.create(CoinOrderDebit, {
        orderId: order.id,
        buyerId: order.buyerId,
        mode,
        amount,
      }),
    );
  }

  async releaseOrderCoins(
    manager: EntityManager,
    order: CoinOrder,
    _cause?: string,
    _now?: Date,
  ) {
    this.assertTransaction(manager);
    const rows = await manager.find(CoinReservation, {
      where: { orderId: order.id, state: COIN_RESERVATION_STATE.COD },
      lock: { mode: 'pessimistic_write' },
    });
    for (const row of rows) {
      const account = await this.lockAccount(manager, row.buyerId);
      const fields = this.balanceFields(row.mode);
      account[fields.held] -= row.amount;
      account[fields.available] += row.amount;
      await manager.save(CoinAccount, account);
      row.state = COIN_RESERVATION_STATE.RELEASED;
      await manager.save(CoinReservation, row);
    }
  }

  async grantPurchaseReward(
    manager: EntityManager,
    buyerId: string,
    orderId: string,
    amount: number,
    mode: ReconciliationMode,
    now: Date = new Date(),
  ) {
    this.assertTransaction(manager);
    this.validAmount(amount);
    const account = await this.lockAccount(manager, buyerId);
    const prior = await manager.findOneBy(CoinPurchaseReward, { orderId });
    if (prior) {
      if (
        prior.buyerId !== buyerId ||
        prior.grantedAmount !== amount ||
        prior.mode !== mode
      )
        throw new BadRequestException('Purchase grant amount or mode changed');
      return prior;
    }
    const fields = this.balanceFields(mode);
    if (
      account[fields.available] + account[fields.held] + amount >
      COIN_POLICY.MAX_POSTGRES_AMOUNT
    )
      throw new BadRequestException('Coin balance limit exceeded');
    account[fields.available] += amount;
    await manager.save(CoinAccount, account);
    return manager.save(
      CoinPurchaseReward,
      manager.create(CoinPurchaseReward, {
        orderId,
        buyerId,
        mode,
        grantedAmount: amount,
        entitlement: amount,
        recoveredAmount: 0,
        evaluatedAt: now,
      }),
    );
  }

  async clawbackCoins(
    manager: EntityManager,
    buyerId: string,
    amount: number,
    mode: ReconciliationMode,
  ) {
    this.assertTransaction(manager);
    this.validAmount(amount);
    if (!amount) return 0;
    const account = await this.lockAccount(manager, buyerId);
    const fields = this.balanceFields(mode);
    const deducted = Math.min(account[fields.available], amount);
    if (deducted > 0) {
      account[fields.available] -= deducted;
      await manager.save(CoinAccount, account);
    }
    return deducted;
  }

  private validAmount(amount: number) {
    if (
      !Number.isSafeInteger(amount) ||
      amount < 0 ||
      amount > COIN_POLICY.MAX_POSTGRES_AMOUNT
    )
      throw new BadRequestException('Invalid coin amount');
  }
}
