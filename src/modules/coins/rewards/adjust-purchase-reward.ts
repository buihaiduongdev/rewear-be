import { ConflictException } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund-credit.entity';
import type { Order } from '@/modules/order/entities';
import { WalletCredit } from '@/modules/wallet/entities';

import { CoinService } from '../core/coin.service';
import { CoinPurchaseReward, CoinRewardAdjustmentNotice } from './entities';
import { purchaseRewardAmount } from './policies/purchase-reward.policy';

/** Recovery belongs to the refund transaction, even while another issue remains open. */
export async function adjustPurchaseReward(
  manager: EntityManager,
  order: Order,
  now: Date,
) {
  const prior = await manager.findOneBy(CoinPurchaseReward, {
    orderId: order.id,
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
    const recovery = await new CoinService().recoverPurchaseReward(
      manager,
      prior.grantId,
      entitlement,
      now,
    );
    await manager.save(
      CoinRewardAdjustmentNotice,
      manager.create(CoinRewardAdjustmentNotice, {
        orderId: order.id,
        buyerId: prior.buyerId,
        grantId: prior.grantId,
        mode: prior.mode,
        previousEntitlement: prior.entitlement,
        entitlement,
        recovered: recovery.collected,
        pendingRecovery: Math.max(0, recovery.target - recovery.collected),
        refundCreditIds: refunds.map((row) => row.id),
        reason: cancellation
          ? 'Purchase cancelled and refunded to wallet'
          : 'Confirmed goods refund reduced the purchase reward basis',
        createdAt: now,
      }),
    );
  }
  prior.entitlement = entitlement;
  prior.evaluatedAt = now;
  return manager.save(prior);
}
