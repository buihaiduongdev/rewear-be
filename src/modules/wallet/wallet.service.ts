import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { MONEY_CURRENCY } from '@/common/constants/money.constant';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { verifiedOrderCoinDebit } from '@/modules/coins/core/verified-order-coin-debit';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund-credit.entity';
import { ORDER_PAYMENT_METHOD } from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities';
import { verifiedPayosCapture } from '@/modules/payment/verified-payos-capture';

import { verifiedWalletCapture } from './checkout/verified-wallet-capture';
import { WALLET_CREDIT_REASON } from './constants/wallet.constant';
import { WalletAccount, WalletCredit } from './entities';
import {
  orderRefundSchema,
  walletBalanceSchema,
} from './schemas/wallet.schema';
import type { WalletQueryInput } from './schemas/wallet.schema';

@Injectable()
export class WalletService {
  constructor(private readonly db: DataSource) {}

  async creditCancellation(manager: EntityManager, order: Order) {
    if (!orderRefundSchema.safeParse(order).success)
      throw new ConflictException('Invalid order refund amount');
    const refundAmount = order.subtotal + order.shippingFee;
    if (refundAmount === 0) return null;
    if (await manager.existsBy(DisputeRefundCredit, { orderId: order.id }))
      throw new ConflictException(
        'Order already has a dispute refund; cancellation needs reconciliation',
      );
    const capture =
      order.paymentMethod === ORDER_PAYMENT_METHOD.WALLET
        ? await verifiedWalletCapture(manager, order)
        : null;
    const payos =
      order.paymentMethod === ORDER_PAYMENT_METHOD.PAYOS
        ? await verifiedPayosCapture(manager, order)
        : null;
    if (!payos && !capture)
      throw new ConflictException(
        'Cancellation payment source requires reconciliation',
      );
    const mode = capture?.mode ?? RECONCILIATION_MODE.SIMULATION;
    if (!(await verifiedOrderCoinDebit(manager, order, mode)))
      throw new ConflictException(
        'Cancellation coin source requires reconciliation',
      );
    const txActive = Boolean(manager.queryRunner?.isTransactionActive);
    let account: WalletAccount | null;
    if (txActive) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(WalletAccount)
        .values({ userId: order.buyerId })
        .orIgnore()
        .execute();
      account = await manager.findOneOrFail(WalletAccount, {
        where: { userId: order.buyerId },
        lock: { mode: 'pessimistic_write' },
      });
    } else {
      account = await manager.findOneBy(WalletAccount, {
        userId: order.buyerId,
      });
      account ??= manager.create(WalletAccount, {
        userId: order.buyerId,
        balance: 0,
        simulationBalance: 0,
        heldBalance: 0,
        simulationHeldBalance: 0,
      });
    }
    const existing = await manager.findOneBy(WalletCredit, {
      orderId: order.id,
    });
    if (existing) {
      if (
        existing.userId !== order.buyerId ||
        existing.amount !== refundAmount ||
        existing.mode !== mode
      )
        throw new ConflictException('Refund ledger requires reconciliation');
      return existing;
    }
    const simulated = mode === RECONCILIATION_MODE.SIMULATION;
    const balanceField = simulated ? 'simulationBalance' : 'balance';
    const held = simulated
      ? account.simulationHeldBalance
      : account.heldBalance;
    const balance = account[balanceField] + refundAmount;
    if (!walletBalanceSchema.safeParse(balance + held).success)
      throw new ConflictException('Wallet balance requires reconciliation');
    const credit = await manager.save(
      WalletCredit,
      manager.create(WalletCredit, {
        userId: order.buyerId,
        orderId: order.id,
        amount: refundAmount,
        reason: WALLET_CREDIT_REASON.ORDER_CANCELLED,
        mode,
      }),
    );
    account[balanceField] = balance;
    await manager.save(account);
    return credit;
  }

  async mine(userId: string, input: WalletQueryInput) {
    const manager = this.db.manager;
    const account = await manager.findOneBy(WalletAccount, { userId });
    const credits = await manager.find(WalletCredit, {
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: input.limit ?? 100,
      skip: input.offset ?? 0,
    });
    const disputeRefunds = await manager.find(DisputeRefundCredit, {
      where: { buyerId: userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: input.limit ?? 100,
      skip: input.offset ?? 0,
    });
    return {
      balance: account?.balance ?? 0,
      simulationBalance: account?.simulationBalance ?? 0,
      heldBalance: account?.heldBalance ?? 0,
      simulationHeldBalance: account?.simulationHeldBalance ?? 0,
      disputeRefunds,
      currency: MONEY_CURRENCY.VND,
      credits,
    };
  }
}
