import { z } from 'zod';

export const createCoinProgramSchema = z.object({
  name: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  audience: z.string().trim().min(1),
  budget: z.number().int().nonnegative().max(2147483647),
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
        amount: z.number().int().positive().max(2147483647),
      }),
    )
    .min(1),
});
export const coinProgramReasonSchema = z.object({
  reason: z.string().trim().min(1),
});
export const coinProgramBudgetSchema = coinProgramReasonSchema.extend({
  budget: z.number().int().nonnegative().max(2147483647),
});
export const coinProgramCorrectionSchema = z.object({
  amount: z.number().int().positive().max(2147483647),
  evidence: z.string().trim().min(1),
});

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
