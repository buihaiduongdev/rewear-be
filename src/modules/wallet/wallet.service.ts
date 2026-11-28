import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import {
  MAX_VND_AMOUNT,
  MONEY_CURRENCY,
} from '@/common/constants/money.constant';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { verifiedOrderCoinDebit } from '@/modules/coins/coin.service';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund-credit.entity';
import { ORDER_PAYMENT_METHOD } from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities';
import { verifiedPayosCapture } from '@/modules/payment/payment.service';

import { WALLET_CREDIT_REASON } from './constants/wallet.constant';
import { WalletAccount, WalletCredit } from './entities';
import {
  orderRefundSchema,
  walletBalanceSchema,
} from './schemas/wallet.schema';
import type { WalletQueryInput } from './schemas/wallet.schema';
import { verifiedWalletCapture } from './wallet-checkout.service';

@Injectable()
export class WalletService {
  constructor(private readonly db: DataSource) {}

  private async lockOrCreateAccount(
    manager: EntityManager,
    userId: string,
  ): Promise<WalletAccount> {
    const txActive = Boolean(manager.queryRunner?.isTransactionActive);
    if (txActive) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(WalletAccount)
        .values({ userId })
        .orIgnore()
        .execute();
      return manager.findOneOrFail(WalletAccount, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
    }
    const existing = await manager.findOneBy(WalletAccount, { userId });
    return (
      existing ??
      manager.create(WalletAccount, {
        userId,
        balance: 0,
        simulationBalance: 0,
        heldBalance: 0,
        simulationHeldBalance: 0,
      })
    );
  }

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
    const gatewayPayment =
      order.paymentMethod === ORDER_PAYMENT_METHOD.PAYOS ||
      order.paymentMethod === ORDER_PAYMENT_METHOD.MOMO
        ? await verifiedPayosCapture(manager, order)
        : null;
    if (!gatewayPayment && !capture)
      throw new ConflictException(
        'Cancellation payment source requires reconciliation',
      );
    const mode = capture?.mode ?? RECONCILIATION_MODE.SIMULATION;
    if (!(await verifiedOrderCoinDebit(manager, order, mode)))
      throw new ConflictException(
        'Cancellation coin source requires reconciliation',
      );
    const account = await this.lockOrCreateAccount(manager, order.buyerId);
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
        paymentRefundId: null,
        amount: refundAmount,
        reason: WALLET_CREDIT_REASON.ORDER_CANCELLED,
        mode,
      }),
    );
    account[balanceField] = balance;
    await manager.save(account);
    return credit;
  }

  async creditLatePaymentRefund(
    manager: EntityManager,
    input: {
      userId: string;
      paymentRefundId: string;
      amount: number;
      mode?: ReconciliationMode;
    },
  ) {
    if (
      !Number.isSafeInteger(input.amount) ||
      input.amount <= 0 ||
      input.amount > MAX_VND_AMOUNT
    ) {
      throw new ConflictException('Invalid late payment refund amount');
    }
    const mode = input.mode ?? RECONCILIATION_MODE.SIMULATION;
    const account = await this.lockOrCreateAccount(manager, input.userId);
    const existing = await manager.findOneBy(WalletCredit, {
      paymentRefundId: input.paymentRefundId,
    });
    if (existing) {
      if (
        existing.userId !== input.userId ||
        existing.amount !== input.amount ||
        existing.mode !== mode
      ) {
        throw new ConflictException('Refund ledger requires reconciliation');
      }
      return existing;
    }
    const simulated = mode === RECONCILIATION_MODE.SIMULATION;
    const balanceField = simulated ? 'simulationBalance' : 'balance';
    const held = simulated
      ? account.simulationHeldBalance
      : account.heldBalance;
    const balance = account[balanceField] + input.amount;
    if (!walletBalanceSchema.safeParse(balance + held).success) {
      throw new ConflictException('Wallet balance requires reconciliation');
    }
    const credit = await manager.save(
      WalletCredit,
      manager.create(WalletCredit, {
        userId: input.userId,
        orderId: null,
        paymentRefundId: input.paymentRefundId,
        amount: input.amount,
        reason: WALLET_CREDIT_REASON.LATE_PAYMENT_REFUND,
        mode,
      }),
    );
    account[balanceField] = balance;
    await manager.save(account);
    return credit;
  }

  async mine(userId: string, input: WalletQueryInput) {
    const manager = this.db.manager;
    const take = input.limit ?? 100;
    const skip = input.offset ?? 0;
    const [account, credits, disputeRefunds] = await Promise.all([
      manager.findOneBy(WalletAccount, { userId }),
      manager.find(WalletCredit, {
        where: { userId },
        order: { createdAt: 'DESC', id: 'DESC' },
        take,
        skip,
      }),
      manager.find(DisputeRefundCredit, {
        where: { buyerId: userId },
        order: { createdAt: 'DESC', id: 'DESC' },
        take,
        skip,
      }),
    ]);
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
