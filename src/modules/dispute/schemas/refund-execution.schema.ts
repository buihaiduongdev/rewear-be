import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { vndAmountSchema } from '@/common/schemas/money.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';

import { returnViewSchema } from './dispute.schema';

export const refundCreditViewSchema = z.object({
  id: z.uuid(),
  decisionId: z.uuid(),
  orderId: z.uuid(),
  mode: z.enum(RECONCILIATION_MODE),
  amount: vndAmountSchema,
  commissionReversed: vndAmountSchema,
  sellerDebit: vndAmountSchema,
  advanceAmount: vndAmountSchema,
  createdAt: dateTimeSchema,
});

export const refundDetailViewSchema = z.object({
  decisionId: z.uuid(),
  issueStatus: z.string(),
  finalRefundAmount: vndAmountSchema.nullable(),
  approvedSellerDebit: vndAmountSchema.nullable(),
  returnCase: returnViewSchema.nullable(),
  credit: refundCreditViewSchema.nullable(),
});

export type RefundCreditView = z.infer<typeof refundCreditViewSchema>;
export type RefundDetailView = z.infer<typeof refundDetailViewSchema>;
