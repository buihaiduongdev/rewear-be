import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { MONEY_CURRENCY } from '@/common/constants/money.constant';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund.entity';
import { Order } from '@/modules/order/entities/order.entity';

import { WALLET_CREDIT_REASON } from './constants/wallet.constant';
import { WalletAccount, WalletCredit } from './entities/wallet.entity';
import { orderRefundSchema } from './schemas/wallet-refund.schema';
import { walletBalanceSchema } from './schemas/wallet.schema';
import type { WalletQueryInput } from './types/wallet.type';

@Injectable()
export class WalletService {
  constructor(private readonly db: DataSource) {}

  // Caller owns the order cancellation transaction; the ledger and stock/order
  // state must commit together. No top-up or generic credit endpoint exists.
  async creditCancellation(manager: EntityManager, order: Order) {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
    if (!orderRefundSchema.safeParse(order).success)
      throw new ConflictException('Invalid order refund amount');
    if (order.total === 0) return null;
    const existing = await manager.findOneBy(WalletCredit, {
      orderId: order.id,
    });
    if (existing) {
      if (existing.userId !== order.buyerId || existing.amount !== order.total)
        throw new ConflictException('Refund ledger requires reconciliation');
      return existing;
    }
    if (await manager.existsBy(DisputeRefundCredit, { orderId: order.id }))
      throw new ConflictException(
        'Order already has a dispute refund; cancellation needs reconciliation',
      );
    let account = await manager.findOneBy(WalletAccount, {
      userId: order.buyerId,
    });
    account ??= manager.create(WalletAccount, {
      userId: order.buyerId,
      balance: 0,
    });
    const balance = account.balance + order.total;
    if (!walletBalanceSchema.safeParse(balance).success)
      throw new ConflictException('Wallet balance requires reconciliation');
    const credit = await manager.save(
      WalletCredit,
      manager.create(WalletCredit, {
        userId: order.buyerId,
        orderId: order.id,
        amount: order.total,
        reason: WALLET_CREDIT_REASON.ORDER_CANCELLED,
      }),
    );
    account.balance = balance;
    await manager.save(account);
    return credit;
  }

  mine(userId: string, input: WalletQueryInput) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
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
        simulationBalance: account?.simulationBalance ?? 0,
        disputeRefunds,
        balance: account?.balance ?? 0,
        currency: MONEY_CURRENCY.VND,
        credits,
      };
    });
  }
}
