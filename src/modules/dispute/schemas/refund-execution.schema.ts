import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { vndAmountSchema } from '@/common/schemas/money.schema';
import { trimmedTextSchema } from '@/common/schemas/request.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';

import {
  REFUND_BLOCK,
  REFUND_STATE,
} from '../constants/refund-execution.constant';
import { disputeRefundPlanSchema } from './dispute-refund-plan.schema';

export const refundConsentSchema = z.strictObject({
  planToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export const refundIncidentSchema = z.strictObject({
  requestId: z.uuid(),
  statusNote: trimmedTextSchema.min(1).max(2000),
  stepsTaken: trimmedTextSchema.min(1).max(4000),
  nextUpdateAt: dateTimeSchema,
});
export const refundExecutionViewSchema = z.object({
  id: z.uuid(),
  finalDecisionId: z.uuid(),
  orderId: z.uuid(),
  status: z.enum(REFUND_STATE),
  blockedReason: z.enum(REFUND_BLOCK).nullable(),
  mode: z.enum(RECONCILIATION_MODE).nullable(),
  eligibleAt: dateTimeSchema.nullable(),
  dueAt: dateTimeSchema.nullable(),
  completedAt: dateTimeSchema.nullable(),
  executionAmount: vndAmountSchema.nullable(),
  alertedAt: dateTimeSchema.nullable(),
  responseDueAt: dateTimeSchema.nullable(),
  respondedAt: dateTimeSchema.nullable(),
});
export const refundCreditViewSchema = z.object({
  id: z.uuid(),
  refundId: z.uuid(),
  orderId: z.uuid(),
  mode: z.enum(RECONCILIATION_MODE),
  amount: vndAmountSchema,
  commissionReversed: vndAmountSchema,
  sellerDebit: vndAmountSchema,
  advanceAmount: vndAmountSchema,
  createdAt: dateTimeSchema,
});

export const refundIncidentViewSchema = z.object({
  id: z.uuid(),
  refundId: z.uuid(),
  actorId: z.uuid(),
  statusNote: z.string(),
  stepsTaken: z.string(),
  nextUpdateAt: dateTimeSchema,
  createdAt: dateTimeSchema,
});
export const refundDetailViewSchema = z.object({
  finalDecisionId: z.uuid(),
  returnCase: z
    .object({
      id: z.uuid(),
      state: z.string(),
      mode: z.string().nullable(),
      handoverBy: dateTimeSchema.nullable(),
      inspectionDueAt: dateTimeSchema.nullable(),
    })
    .nullable(),
  refundPlan: disputeRefundPlanSchema.nullable(),
  planToken: z.string(),
  approvedSellerDebit: vndAmountSchema.nullable(),
  refund: refundExecutionViewSchema.nullable(),
  credits: z.array(refundCreditViewSchema),
  updates: z.array(refundIncidentViewSchema),
});
