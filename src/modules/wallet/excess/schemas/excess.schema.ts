import z from 'zod';

import { dateTimeSchema } from '@/common/schemas/date-time.schema';
import { vndAmountSchema } from '@/common/schemas/money.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';

import {
  EXCESS_PAYMENT_STATE,
  EXCESS_POLICY,
  EXCESS_REVIEW,
  EXCESS_SOURCE,
} from '../constants/excess.constant';

const text = z.string().trim().min(3).max(4000);
export const excessVerifySchema = z.strictObject({
  requestId: z.uuid(),
  sourceType: z.enum(EXCESS_SOURCE),
  sourceId: z.uuid(),
  authorizedAmount: vndAmountSchema,
  reason: text,
  evidence: text,
});
export const excessObjectSchema = z.strictObject({
  requestId: z.uuid(),
  reason: text,
  evidence: text,
});
export const excessCorrectSchema = excessObjectSchema.extend({
  expectedVersion: z.number().int().positive(),
  authorizedAmount: vndAmountSchema,
});
export const excessQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export const excessPaySchema = z.strictObject({
  requestId: z.uuid(),
  excessIds: z
    .array(z.uuid())
    .min(1)
    .max(EXCESS_POLICY.MAX_TARGETS)
    .refine((ids) => new Set(ids).size === ids.length),
  amount: vndAmountSchema.positive(),
});
export const excessResponseSchema = z.strictObject({
  requestId: z.uuid(),
  message: text,
});
export const excessWithdrawSchema = z.strictObject({
  requestId: z.uuid(),
  confirmed: z.literal(true),
});
export const excessIncidentSchema = z.strictObject({
  requestId: z.uuid(),
  message: text,
  nextUpdateAt: z.iso.datetime(),
});

const nullableDate = dateTimeSchema.nullable();
export const excessSummarySchema = z.object({
  id: z.uuid(),
  buyerId: z.uuid(),
  mode: z.enum(RECONCILIATION_MODE),
  sourceType: z.enum(EXCESS_SOURCE),
  sourceId: z.uuid(),
  sourceAmount: vndAmountSchema,
  authorizedAmount: vndAmountSchema,
  version: z.number().int().positive(),
  decisionVersion: z.number().int().positive(),
  reason: z.string(),
  evidence: z.string(),
  verifiedAt: dateTimeSchema,
  objectionBy: dateTimeSchema,
  reviewState: z.enum(EXCESS_REVIEW),
  objectedAt: nullableDate,
  objectionReason: z.string().nullable(),
  objectionEvidence: z.string().nullable(),
  reviewDueAt: nullableDate,
  reviewOverdueAt: nullableDate,
  responseDueAt: nullableDate,
  supplementRequest: z.string().nullable(),
  liability: vndAmountSchema,
  collected: z.number().int().nonnegative(),
  returned: z.number().int().nonnegative(),
  net: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
  outstanding: vndAmountSchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export const excessViewSchema = excessSummarySchema.extend({
  history: z.array(
    z.object({
      id: z.uuid(),
      action: z.string(),
      reason: z.string(),
      detail: z.record(z.string(), z.unknown()),
      createdAt: dateTimeSchema,
    }),
  ),
});
export const excessPageSchema = z.object({
  items: z.array(excessSummarySchema),
  totalCount: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export const excessCommandViewSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive().optional(),
});
export const excessPaymentViewSchema = z.object({
  id: z.uuid(),
  amount: vndAmountSchema,
  mode: z.literal(RECONCILIATION_MODE.SIMULATION),
  state: z.enum(EXCESS_PAYMENT_STATE),
  payUrl: z.string().nullable(),
  targets: z.array(z.object({ excessId: z.uuid(), amount: vndAmountSchema })),
  refunds: z.array(
    z.object({
      id: z.uuid(),
      amount: vndAmountSchema,
      state: z.enum(EXCESS_PAYMENT_STATE),
      alertedAt: nullableDate,
      responseDueAt: nullableDate,
    }),
  ),
});
export const excessRefundQueueSchema = z.array(
  z.object({
    id: z.uuid(),
    captureId: z.uuid(),
    returnId: z.uuid().nullable(),
    amount: vndAmountSchema,
    state: z.enum(EXCESS_PAYMENT_STATE),
    alertedAt: nullableDate,
    responseDueAt: nullableDate,
    nextQueryAt: dateTimeSchema,
  }),
);
