import { ConflictException } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { adjustPurchaseReward } from '@/modules/coins/rewards/adjust-purchase-reward';
import { Order } from '@/modules/order/entities';
import { encumberedOrderSettlement } from '@/modules/shop-finance/payout-sources';
import { WalletAccount } from '@/modules/wallet/entities';
import { walletBalanceSchema } from '@/modules/wallet/schemas/wallet.schema';

import {
  DISPUTE_ACTION,
  DISPUTE_ISSUE_STATE,
} from './constants/dispute.constant';
import { REFUND_STATE } from './constants/refund-execution.constant';
import { restoreDisputeCaseIfClear } from './dispute-finalization.lifecycle';
import type { refundFunding } from './dispute-refund-funding';
import { notifyDispute, recordDisputeAction } from './dispute.lifecycle';
import { DisputeFinalDecision } from './entities/dispute-final-decision.entity';
import { DisputeIssue } from './entities/dispute-issue.entity';
import { DisputeRefundCredit } from './entities/dispute-refund-credit.entity';
import { DisputeRefund } from './entities/dispute-refund.entity';
import { refundAllocation } from './policies/refund-allocation.policy';

export async function executeDisputeRefund(
  manager: EntityManager,
  refund: DisputeRefund,
  final: DisputeFinalDecision,
  issue: DisputeIssue,
  order: Order,
  funding: NonNullable<Awaited<ReturnType<typeof refundFunding>>>,
  now: Date,
) {
  const previous = await manager.find(DisputeRefundCredit, {
    where: { remedyKey: final.remedyKey },
  });
  const sourceChanged = previous.some(
    (row) =>
      row.mode !== funding.mode ||
      row.buyerId !== order.buyerId ||
      row.orderId !== order.id ||
      row.shopId !== order.shopId,
  );
  if (sourceChanged)
    throw new ConflictException(
      'Refund source changed; reconciliation required',
    );
  const paid = previous.reduce((sum, row) => sum + row.amount, 0);
  const allocation =
    refund.executionAmount === 0
      ? { amount: 0, commissionReversed: 0, sellerDebit: 0 }
      : refundAllocation(
          final.itemPrice,
          refund.executionAmount ?? final.refundPlan!.amount,
          paid,
          order.commissionBasisPoints,
        );
  // Zero means this same item's entitlement was already fulfilled by another issue.
  const orderCredits = await manager.find(DisputeRefundCredit, {
    where: { orderId: order.id, mode: funding.mode },
  });
  const cashAlreadyAllocated = orderCredits.reduce(
    (sum, row) => sum + row.amount,
    0,
  );
  const cashAvailable = Math.max(
    0,
    funding.itemFundsAvailable -
      cashAlreadyAllocated -
      (await encumberedOrderSettlement(manager, order.id, funding.mode)),
  );
  const credit = await manager.save(
    DisputeRefundCredit,
    manager.create(DisputeRefundCredit, {
      refundId: refund.id,
      orderId: order.id,
      buyerId: order.buyerId,
      shopId: order.shopId,
      remedyKey: final.remedyKey,
      mode: funding.mode,
      ...allocation,
      advanceAmount: Math.max(0, allocation.amount - cashAvailable),
      createdAt: now,
    }),
  );
  if (allocation.amount > 0)
    await creditBuyerWallet(
      manager,
      order.buyerId,
      funding.mode,
      allocation.amount,
    );
  await adjustPurchaseReward(manager, order, now);
  refund.status = REFUND_STATE.SUCCEEDED;
  refund.blockedReason = null;
  refund.completedAt = now;
  await manager.save(refund);
  issue.status = DISPUTE_ISSUE_STATE.RESOLVED_REFUND;
  await manager.save(issue);
  const reason = `Wallet refund completed: ${credit.amount} VND (${funding.mode}); item entitlement ${final.refundPlan!.amount} VND`;
  await recordDisputeAction(
    manager,
    issue.id,
    DISPUTE_ACTION.REFUNDED,
    null,
    now,
    reason,
  );
  await notifyDispute(manager, issue.id, DISPUTE_ACTION.REFUNDED, now, reason);
  await restoreDisputeCaseIfClear(manager, issue.caseId);
  return refund;
}

async function creditBuyerWallet(
  manager: EntityManager,
  userId: string,
  mode: string,
  amount: number,
) {
  let account = await manager.findOneBy(WalletAccount, { userId });
  account ??= manager.create(WalletAccount, {
    userId,
    balance: 0,
    simulationBalance: 0,
  });
  const field =
    mode === RECONCILIATION_MODE.SIMULATION ? 'simulationBalance' : 'balance';
  const balance = account[field] + amount;
  const held =
    mode === RECONCILIATION_MODE.SIMULATION
      ? (account.simulationHeldBalance ?? 0)
      : (account.heldBalance ?? 0);
  if (!walletBalanceSchema.safeParse(balance + held).success)
    throw new ConflictException('Wallet refund exceeds safe balance');
  account[field] = balance;
  await manager.save(account);
}
