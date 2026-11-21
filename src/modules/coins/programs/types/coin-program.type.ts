import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';

export type CreateCoinProgram = {
  name: string;
  reason: string;
  audience: string;
  budget: number;
  mode: ReconciliationMode;
  expiresAt: Date | null;
};
export type CoinProgramRecipient = { buyerId: string; amount: number };
