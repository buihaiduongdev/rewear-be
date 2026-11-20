import { EntityManager } from 'typeorm';

import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund.entity';

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
  const simulation = mode === RECONCILIATION_MODE.SIMULATION;
  return walletProvenance(
    (simulation ? account?.simulationBalance : account?.balance) ?? 0,
    (simulation ? account?.simulationHeldBalance : account?.heldBalance) ?? 0,
    Number(disputeCredits ?? 0) + Number(cancellations ?? 0),
    Number(debits ?? 0),
  );
}
