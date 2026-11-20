import { ConflictException } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { safeBalanceSchema } from '@/common/schemas/money.schema';
import { walletPoolFields } from '@/modules/wallet/checkout/policies/wallet-checkout.policy';
import { WalletAccount } from '@/modules/wallet/entities/wallet.entity';

import {
  FEE_COLLECTION_METHOD,
  FEE_PARTY,
  FEE_REFUND_STATE,
} from '../constants/fee.constant';
import {
  FeeAssessment,
  FeeCollection,
  FeeRefund,
} from '../entities/fee.entity';
import {
  FeeOffsetAllocation,
  FeeWalletDebit,
} from './entities/fee-settlement.entity';

export async function settleInternalFeeRefund(
  manager: EntityManager,
  refund: FeeRefund,
  now: Date,
) {
  if (refund.state !== FEE_REFUND_STATE.PENDING) return;
  const collection = await manager.findOneByOrFail(FeeCollection, {
    id: refund.collectionId,
    feeId: refund.feeId,
    mode: refund.mode,
    method: refund.method,
    sourceId: refund.sourceId,
  });
  const allRefunds = await manager.sum(FeeRefund, 'amount', {
    collectionId: collection.id,
  });
  if (
    !safeBalanceSchema.safeParse(refund.amount).success ||
    refund.amount <= 0 ||
    Number(allRefunds) > collection.amount
  )
    throw new ConflictException(
      'Fee refund source exceeds original collection',
    );
  if (refund.method === FEE_COLLECTION_METHOD.WALLET)
    await refundBuyerWallet(manager, refund);
  else if (refund.method === FEE_COLLECTION_METHOD.SHOP_OFFSET) {
    const allocations = await manager.findBy(FeeOffsetAllocation, {
      collectionId: collection.id,
      mode: collection.mode,
    });
    if (
      allocations.reduce((sum, row) => sum + row.amount, 0) !==
      collection.amount
    )
      throw new ConflictException(
        'Fee offset refund requires matched original allocations',
      );
  } else return;
  // Shop refunds become their own immediately-available source, never escrow.
  refund.state = FEE_REFUND_STATE.SUCCEEDED;
  refund.completedAt = now;
  await manager.save(refund);
}

async function refundBuyerWallet(manager: EntityManager, refund: FeeRefund) {
  const fee = await manager.findOneByOrFail(FeeAssessment, {
    id: refund.feeId,
    party: FEE_PARTY.BUYER,
  });
  await manager.findOneByOrFail(FeeWalletDebit, {
    id: refund.sourceId,
    feeId: fee.id,
    buyerId: fee.buyerId,
    mode: refund.mode,
  });
  const account = await manager.findOneByOrFail(WalletAccount, {
    userId: fee.buyerId,
  });
  const [field, held] = walletPoolFields(refund.mode);
  const balance = account[field] + refund.amount;
  if (!safeBalanceSchema.safeParse(balance + account[held]).success)
    throw new ConflictException(
      'Fee wallet refund requires balance reconciliation',
    );
  account[field] = balance;
  await manager.save(account);
}
