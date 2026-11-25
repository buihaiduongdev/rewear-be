import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { vndAmountSchema } from '@/common/schemas/money.schema';
import { trimmedTextSchema } from '@/common/schemas/request.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';

import {
  COD_CANCELLATION_REASON,
  COD_FAULT_PARTY,
  COD_MAX_ORDER_TOTAL,
  COD_RESTRICTION_CAUSE,
} from '../constants/cod.constant';

export type CodRestrictionCause =
  (typeof COD_RESTRICTION_CAUSE)[keyof typeof COD_RESTRICTION_CAUSE];
export type CodCancellationReason =
  (typeof COD_CANCELLATION_REASON)[keyof typeof COD_CANCELLATION_REASON];
export type CodFaultParty =
  (typeof COD_FAULT_PARTY)[keyof typeof COD_FAULT_PARTY];

export const placeCodSchema = z.strictObject({
  expectedTotal: vndAmountSchema,
});
export type PlaceCodInput = z.infer<typeof placeCodSchema>;

export const codOrderTotalSchema = vndAmountSchema.max(COD_MAX_ORDER_TOTAL);

export const cancelCodSchema = z.strictObject({
  reason: z.literal(COD_CANCELLATION_REASON.CHANGE_OF_MIND),
});
export type CancelCodInput = z.infer<typeof cancelCodSchema>;

export const resolveCodReturnSchema = z.strictObject({
  fault: z.enum(COD_FAULT_PARTY),
  mode: z.enum(RECONCILIATION_MODE).default(RECONCILIATION_MODE.SIMULATION),
  sellable: z.boolean().default(true),
  reason: trimmedTextSchema.min(1).max(1000),
});
export type ResolveCodReturnInput = z.infer<typeof resolveCodReturnSchema>;

export const codRestrictionsSchema = z.array(
  z.object({
    id: z.uuid(),
    cause: z.enum(COD_RESTRICTION_CAUSE),
    blockedUntil: dateTimeSchema.nullable(),
    resolvedAt: dateTimeSchema.nullable(),
    resolutionReason: z.string().nullable(),
    createdAt: dateTimeSchema,
  }),
);
