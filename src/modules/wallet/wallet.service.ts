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
import { EXCESS_SOURCE } from './excess/constants/excess.constant';
import { offsetExcessRefund } from './excess/policies/excess-accounting.policy';
import { orderRefundSchema } from './schemas/wallet-refund.schema';
import { walletBalanceSchema } from './schemas/wallet.schema';
import type { WalletQueryInput } from './schemas/wallet.schema';
import { verifiedWalletFunds } from './verified-wallet-funds';

@Injectable()
export class WalletService {
  constructor(private readonly db: DataSource) {}

  // Caller owns the order cancellation transaction; the ledger and stock/order
  // state must commit together. No top-up or generic credit endpoint exists.
  async creditCancellation(manager: EntityManager, order: Order) {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
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
    const invalidSource = !payos && !capture;
    if (invalidSource)
      throw new ConflictException(
        'Cancellation payment source requires reconciliation',
      );
    const mode = capture?.mode ?? RECONCILIATION_MODE.SIMULATION;
    if (!(await verifiedOrderCoinDebit(manager, order, mode)))
      throw new ConflictException(
        'Cancellation coin source requires reconciliation',
      );
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
    let account = await manager.findOneBy(WalletAccount, {
      userId: order.buyerId,
    });
    account ??= manager.create(WalletAccount, {
      userId: order.buyerId,
      balance: 0,
      simulationBalance: 0,
      heldBalance: 0,
      simulationHeldBalance: 0,
    });
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
    await offsetExcessRefund(manager, EXCESS_SOURCE.CANCELLATION, credit.id);
    return credit;
  }

  async mine(userId: string, input: WalletQueryInput) {
    const manager = this.db.manager;
    const account = await manager.findOneBy(WalletAccount, { userId });
    const evidence = await verifiedWalletFunds(
      manager,
      userId,
      RECONCILIATION_MODE.EVIDENCE,
    );
    const simulation = await verifiedWalletFunds(
      manager,
      userId,
      RECONCILIATION_MODE.SIMULATION,
    );
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
      simulationBalance: account?.simulationBalance ?? 0,
      heldBalance: evidence.held,
      simulationHeldBalance: simulation.held,
      spendableBalance: evidence.spendable,
      simulationSpendableBalance: simulation.spendable,
      quarantinedBalance: evidence.quarantined,
      simulationQuarantinedBalance: simulation.quarantined,
      disputeRefunds,
      balance: account?.balance ?? 0,
      currency: MONEY_CURRENCY.VND,
      credits,
    };
  }
}
