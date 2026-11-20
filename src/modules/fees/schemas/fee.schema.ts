import z from 'zod';

import { dateTimeSchema } from '@/common/schemas/date-time.schema';
import { vndAmountSchema } from '@/common/schemas/money.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';

import {
  FEE_COLLECTION_METHOD,
  FEE_KIND,
  FEE_PARTY,
  FEE_REFUND_STATE,
  FEE_STATUS,
} from '../constants/fee.constant';

const proof = z.string().trim().min(10).max(4000);
export const feeAssessmentSchema = z.strictObject({
  orderId: z.uuid(),
  party: z.enum(FEE_PARTY),
  mode: z.enum(RECONCILIATION_MODE),
  kind: z.enum(FEE_KIND),
  sourceId: z.string().trim().min(1).max(200),
  waybillId: z.string().trim().min(1).max(200),
  invoiceReference: z.string().trim().min(1).max(200),
  invoiceLine: z.string().trim().min(1).max(200),
  amount: vndAmountSchema.positive(),
  actualInvoiceAmount: vndAmountSchema.positive().optional(),
  originallyQuotedAmount: vndAmountSchema.optional(),
  reason: proof,
  evidence: proof,
});
export const feeObjectionSchema = z.strictObject({
  reason: proof,
  evidence: proof,
});
export const feeCorrectionSchema = feeObjectionSchema.extend({
  payableAmount: vndAmountSchema,
});
export const feeViewSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  party: z.enum(FEE_PARTY),
  mode: z.enum(RECONCILIATION_MODE),
  kind: z.enum(FEE_KIND),
  amount: z.number(),
  payableAmount: z.number(),
  status: z.enum(FEE_STATUS),
  outstanding: vndAmountSchema,
  reason: z.string(),
  notices: z.array(
    z.object({
      id: z.uuid(),
      action: z.string(),
      amount: vndAmountSchema,
      reason: z.string(),
      dueAt: dateTimeSchema.nullable(),
      createdAt: dateTimeSchema,
    }),
  ),
  collections: z.array(
    z.object({
      id: z.uuid(),
      method: z.enum(FEE_COLLECTION_METHOD),
      amount: vndAmountSchema,
      createdAt: dateTimeSchema,
    }),
  ),
  refunds: z.array(
    z.object({
      id: z.uuid(),
      method: z.enum(FEE_COLLECTION_METHOD),
      amount: vndAmountSchema,
      state: z.enum(FEE_REFUND_STATE),
      requestedAt: dateTimeSchema,
      completedAt: dateTimeSchema.nullable(),
    }),
  ),
  notifiedAt: dateTimeSchema.nullable(),
  dueAt: dateTimeSchema.nullable(),
  objectionUsed: z.boolean(),
  objectionAt: dateTimeSchema.nullable(),
  reviewDueAt: dateTimeSchema.nullable(),
  reviewOverdueAt: dateTimeSchema.nullable(),
});

export const feeAdminQueueSchema = z.strictObject({
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

export const feeHistorySchema = z.array(
  z.object({
    action: z.string(),
    payableAmount: z.number(),
    reason: z.string(),
    createdAt: dateTimeSchema,
  }),
);
