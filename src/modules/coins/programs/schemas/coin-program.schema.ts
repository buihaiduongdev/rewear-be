import { z } from 'zod';

import { MAX_VND_AMOUNT } from '@/common/constants/money.constant';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

export const createCoinProgramSchema = z.object({
  name: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  audience: z.string().trim().min(1),
  budget: z.number().int().nonnegative().max(MAX_VND_AMOUNT),
  mode: z.enum(['EVIDENCE', 'SIMULATION']),
  expiresAt: z.iso.datetime().nullable(),
});
export const issueCoinProgramSchema = z.object({
  requestId: z.uuid(),
  reason: z.string().trim().min(1),
  recipients: z
    .array(
      z.object({
        buyerId: z.uuid(),
        amount: z.number().int().positive().max(MAX_VND_AMOUNT),
      }),
    )
    .min(1),
});
export const coinProgramReasonSchema = z.object({
  reason: z.string().trim().min(1),
});
export const coinProgramBudgetSchema = coinProgramReasonSchema.extend({
  budget: z.number().int().nonnegative().max(MAX_VND_AMOUNT),
});
export const coinProgramCorrectionSchema = z.object({
  amount: z.number().int().positive().max(MAX_VND_AMOUNT),
  evidence: z.string().trim().min(1),
});

export type CreateCoinProgram = {
  name: string;
  reason: string;
  audience: string;
  budget: number;
  mode: ReconciliationMode;
  expiresAt: Date | null;
};
export type CoinProgramRecipient = { buyerId: string; amount: number };

export const coinCodReleaseSchema = z.object({
  requestId: z.uuid(),
  cause: z.enum([
    'SELLER',
    'CARRIER',
    'INCONCLUSIVE',
    'BUYER_CHANGE',
    'BUYER',
    'UNKNOWN',
  ]),
  evidence: z.string().trim().min(1),
});
