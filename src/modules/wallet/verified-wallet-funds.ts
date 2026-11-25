import { ConflictException } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { safeBalanceSchema } from '@/common/schemas/money.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund-credit.entity';

import { WalletDebit } from './checkout/entities';
import { WalletAccount, WalletCredit } from './entities';

export function walletProvenance(
  available: number,
  held: number,
  credits: number,
  debits: number,
) {
  const validAmounts = [
    available,
    held,
    credits,
    debits,
    available + held,
  ].every((amount) => safeBalanceSchema.safeParse(amount).success);
  if (!validAmounts || debits > credits)
    throw new ConflictException('Wallet provenance requires reconciliation');
  const backing = credits - debits;
  const spendable = Math.min(available, Math.max(0, backing - held));
  return {
    available,
    held,
    backing,
    spendable,
    quarantined: available - spendable,
  };
}

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
