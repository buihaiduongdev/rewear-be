import { ConflictException } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund-credit.entity';
import type { Order } from '@/modules/order/entities';
import { WalletCredit } from '@/modules/wallet/entities';

import { CoinService } from '../core/coin.service';
import { COIN_POLICY } from '../core/constants/coin.constant';
import { CoinPurchaseReward } from '../core/entities';

export const PURCHASE_REWARD_DIVISOR = COIN_POLICY.PURCHASE_REWARD_DIVISOR;

export function purchaseRewardAmount(
  subtotal: number,
  coinDiscount: number,
  itemRefunds: number,
) {
  return Math.floor(
    Math.max(0, subtotal - coinDiscount - itemRefunds) /
      PURCHASE_REWARD_DIVISOR,
  );
}

export async function adjustPurchaseReward(
  manager: EntityManager,
  order: Order,
  now: Date,
) {
  const prior = await manager.findOne(CoinPurchaseReward, {
    where: { orderId: order.id },
    lock: { mode: 'pessimistic_write' },
  });
  if (!prior) return null;
  if (prior.buyerId !== order.buyerId)
    throw new ConflictException('Purchase reward owner changed');
  const cancellation = await manager.findOneBy(WalletCredit, {
    orderId: order.id,
  });
  if (
    cancellation &&
    (cancellation.mode !== prior.mode || cancellation.userId !== prior.buyerId)
  )
    throw new ConflictException('Reward cancellation source changed');
  const refunds = await manager.findBy(DisputeRefundCredit, {
    orderId: order.id,
    mode: prior.mode,
  });
  const target = cancellation
    ? 0
    : purchaseRewardAmount(
        order.subtotal,
        order.coinDiscount ?? 0,
        refunds.reduce((sum, row) => sum + row.amount, 0),
      );
  const entitlement = Math.min(prior.entitlement, target);
  if (entitlement < prior.entitlement) {
    const deducted = await new CoinService().clawbackCoins(
      manager,
      prior.buyerId,
      prior.entitlement - entitlement,
      prior.mode,
    );
    prior.recoveredAmount += deducted;
    prior.entitlement = entitlement;
  }
  prior.evaluatedAt = now;
  return manager.save(CoinPurchaseReward, prior);
}
