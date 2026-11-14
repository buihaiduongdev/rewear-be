import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';

export const walletBalanceSchema = z.number().int().nonnegative();

export const walletQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});
export type WalletQueryInput = z.output<typeof walletQuerySchema>;

export const walletViewSchema = z.object({
  balance: walletBalanceSchema,
  currency: z.literal('VND'),
  credits: z.array(
    z.object({
      id: z.uuid(),
      orderId: z.uuid(),
      amount: z.number().int().positive(),
      reason: z.literal('ORDER_CANCELLED'),
      createdAt: dateTimeSchema,
    }),
  ),
});
