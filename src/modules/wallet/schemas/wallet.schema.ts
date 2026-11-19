import z from 'zod';

import { MONEY_CURRENCY } from '@/common/constants/money.constant';
import { dateTimeSchema } from '@/common/schemas';
import {
  safeBalanceSchema,
  vndAmountSchema,
} from '@/common/schemas/money.schema';
import { refundCreditViewSchema } from '@/modules/dispute/schemas/refund-execution.schema';

import { WALLET_CREDIT_REASON } from '../constants/wallet.constant';

export type { WalletQueryInput } from '../types/wallet.type';

export const walletBalanceSchema = safeBalanceSchema;

export const walletQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});

export const walletViewSchema = z.object({
  balance: walletBalanceSchema,
  simulationBalance: walletBalanceSchema,
  disputeRefunds: z.array(refundCreditViewSchema),
  currency: z.literal(MONEY_CURRENCY.VND),
  credits: z.array(
    z.object({
      id: z.uuid(),
      orderId: z.uuid(),
      amount: vndAmountSchema.positive(),
      reason: z.enum(WALLET_CREDIT_REASON),
      createdAt: dateTimeSchema,
    }),
  ),
});
