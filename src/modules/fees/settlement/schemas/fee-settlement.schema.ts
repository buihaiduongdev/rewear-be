import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { vndAmountSchema } from '@/common/schemas/money.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';

export const feeWalletPaymentSchema = z.strictObject({
  requestId: z.uuid(),
  expectedAmount: vndAmountSchema.positive(),
});
export const feeWalletPaymentViewSchema = z.object({
  id: z.uuid(),
  feeId: z.uuid(),
  amount: vndAmountSchema.positive(),
  mode: z.enum(RECONCILIATION_MODE),
});
export const feeCarrierRefundSchema = z.strictObject({
  amount: vndAmountSchema.positive(),
  reference: z.string().trim().min(1).max(120),
  receivedAt: z.iso.datetime({ offset: true }),
  evidence: z.string().trim().min(1).max(2000),
});
export const feeCarrierRefundViewSchema = z.object({
  id: z.uuid(),
  completedAt: dateTimeSchema.nullable(),
  state: z.string(),
  amount: vndAmountSchema.positive(),
});

export type FeeWalletPaymentInput = z.infer<typeof feeWalletPaymentSchema>;
export type FeeCarrierRefundInput = z.infer<typeof feeCarrierRefundSchema>;
