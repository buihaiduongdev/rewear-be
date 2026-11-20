import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { vndAmountSchema } from '@/common/schemas/money.schema';
import { trimmedTextSchema } from '@/common/schemas/request.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';

import {
  CARRIER_DIRECTION,
  CARRIER_RECEIPT_KIND,
  RETURN_EXCEPTION_KIND,
  RETURN_FEE_KIND,
  SAFETY_BASIS,
} from '../constants/return-exception.constant';

const text = trimmedTextSchema.min(1).max(4000);
const evidenceIds = z
  .array(z.uuid())
  .min(1)
  .max(10)
  .refine((ids) => new Set(ids).size === ids.length);
const command = z.object({ requestId: z.uuid() });
export const safetyWaiverSchema = command
  .extend({
    mode: z.enum(RECONCILIATION_MODE),
    basis: z.enum(SAFETY_BASIS),
    reason: text,
    instructions: text,
    evidenceIds,
  })
  .strict();
export const safetyExecutionSchema = command
  .extend({ statement: text, evidenceIds })
  .strict();
export const safetyConfirmSchema = command
  .extend({ reviewToken: z.string().regex(/^[a-f0-9]{64}$/), reason: text })
  .strict();
export const carrierExceptionSchema = command
  .extend({
    reviewToken: z.string().regex(/^[a-f0-9]{64}$/),
    direction: z.enum(CARRIER_DIRECTION),
    kind: z.enum(RETURN_EXCEPTION_KIND),
    mode: z.enum(RECONCILIATION_MODE),
    waybillCode: z.string().min(1).max(50),
    occurredAt: dateTimeSchema,
    reason: text,
    dispositionInstructions: text,
    evidenceIds,
  })
  .strict();
export const carrierAcknowledgementSchema = command
  .extend({
    amount: vndAmountSchema.positive(),
    conditions: text,
    evidence: text,
  })
  .strict();
export const carrierReceiptSchema = command
  .extend({
    chargeId: z.uuid().optional(),
    mode: z.enum(RECONCILIATION_MODE),
    reference: trimmedTextSchema
      .min(1)
      .max(120)
      .transform((value) => value.toUpperCase()),
    kind: z.enum(CARRIER_RECEIPT_KIND),
    amount: vndAmountSchema.positive(),
    receivedAt: dateTimeSchema,
    evidence: text,
  })
  .strict()
  .refine(
    (data) =>
      data.kind === CARRIER_RECEIPT_KIND.VERIFIED_NETTING
        ? !!data.chargeId
        : !data.chargeId,
    'Netting requires a linked charge; cash cannot silently settle a charge',
  );
export const returnShippingChargeSchema = command
  .extend({
    mode: z.enum(RECONCILIATION_MODE),
    kind: z.enum(RETURN_FEE_KIND),
    amount: vndAmountSchema.positive(),
    invoiceReference: trimmedTextSchema
      .min(1)
      .max(120)
      .transform((value) => value.toUpperCase()),
    reason: text,
    evidence: text,
  })
  .strict();

export const safetyWaiverViewSchema = z.object({
  id: z.uuid(),
  finalDecisionId: z.uuid(),
  mode: z.enum(RECONCILIATION_MODE),
  basis: z.enum(SAFETY_BASIS),
  reason: z.string(),
  instructions: z.string(),
  basisEvidenceIds: z.array(z.uuid()),
  executionEvidenceIds: z.array(z.uuid()).nullable(),
  executionStatement: z.string().nullable(),
  submittedAt: dateTimeSchema.nullable(),
  fulfilledAt: dateTimeSchema.nullable(),
});
export const carrierExceptionViewSchema = z.object({
  id: z.uuid(),
  finalDecisionId: z.uuid(),
  orderId: z.uuid(),
  shopId: z.uuid(),
  returnId: z.uuid().nullable(),
  direction: z.enum(CARRIER_DIRECTION),
  kind: z.enum(RETURN_EXCEPTION_KIND),
  mode: z.enum(RECONCILIATION_MODE),
  waybillCode: z.string(),
  reason: z.string(),
  dispositionInstructions: z.string(),
  evidenceIds: z.array(z.uuid()),
  occurredAt: dateTimeSchema,
  createdAt: dateTimeSchema,
});
export const carrierAcknowledgementViewSchema = z.object({
  id: z.uuid(),
  exceptionId: z.uuid(),
  amount: vndAmountSchema,
  conditions: z.string(),
  createdAt: dateTimeSchema,
});
export const carrierReceiptViewSchema = z.object({
  id: z.uuid(),
  exceptionId: z.uuid(),
  orderId: z.uuid(),
  chargeId: z.uuid().nullable(),
  mode: z.enum(RECONCILIATION_MODE),
  kind: z.enum(CARRIER_RECEIPT_KIND),
  amount: vndAmountSchema,
  receivedAt: dateTimeSchema,
  createdAt: dateTimeSchema,
});
export const returnShippingChargeViewSchema = z.object({
  id: z.uuid(),
  returnId: z.uuid(),
  orderId: z.uuid(),
  mode: z.enum(RECONCILIATION_MODE),
  kind: z.enum(RETURN_FEE_KIND),
  amount: vndAmountSchema,
  reason: z.string(),
  createdAt: dateTimeSchema,
});
export const returnExceptionDetailSchema = z.object({
  safety: safetyWaiverViewSchema.nullable(),
  reviewToken: z.string().nullable(),
  claims: z.array(
    z.object({
      exception: carrierExceptionViewSchema,
      acknowledgement: carrierAcknowledgementViewSchema.nullable(),
      receipts: z.array(carrierReceiptViewSchema),
    }),
  ),
  charges: z.array(returnShippingChargeViewSchema),
});
