import { EntityManager } from 'typeorm';

import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund.entity';
import {
  FEE_COLLECTION_METHOD,
  FEE_PARTY,
  FEE_REFUND_STATE,
} from '@/modules/fees/constants/fee.constant';
import { FeeWalletDebit } from '@/modules/fees/settlement/entities/fee-settlement.entity';

import { WalletDebit } from './checkout/entities/wallet-checkout.entity';
import { WalletAccount, WalletCredit } from './entities/wallet.entity';
import { walletProvenance } from './policies/wallet-provenance.policy';

/** Caller holds commerce lock for writes; display may use a repeatable-read snapshot. */
export async function verifiedWalletFunds(
  manager: EntityManager,
  userId: string,
  mode: ReconciliationMode,
) {
  const account = await manager.findOneBy(WalletAccount, { userId });
  const disputeCredits = await manager.sum(DisputeRefundCredit, 'amount', {
    buyerId: userId,
    mode,
  });
  const cancellations = await manager.sum(WalletCredit, 'amount', {
    userId,
    mode,
  });
  const debits = await manager.sum(WalletDebit, 'amount', {
    buyerId: userId,
    mode,
  });
  const feeDebits = await manager.sum(FeeWalletDebit, 'amount', {
    buyerId: userId,
    mode,
  });
  const [feeCredits] = await manager.query(
    `SELECT COALESCE(SUM(r.amount),0) AS amount
    FROM fee_refunds r JOIN fee_assessments f ON f.id=r."feeId"
    WHERE f."buyerId"=$1 AND f.party=$2 AND f.mode=$3 AND r.mode=$3 AND r.method=$4 AND r.state=$5`,
    [
      userId,
      FEE_PARTY.BUYER,
      mode,
      FEE_COLLECTION_METHOD.WALLET,
      FEE_REFUND_STATE.SUCCEEDED,
    ],
  );
  const simulation = mode === RECONCILIATION_MODE.SIMULATION;
  return walletProvenance(
    (simulation ? account?.simulationBalance : account?.balance) ?? 0,
    (simulation ? account?.simulationHeldBalance : account?.heldBalance) ?? 0,
    Number(disputeCredits ?? 0) +
      Number(cancellations ?? 0) +
      Number(feeCredits.amount),
    Number(debits ?? 0) + Number(feeDebits ?? 0),
  );
}
