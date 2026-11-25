import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { vndAmountSchema } from '@/common/schemas/money.schema';

import {
  COD_CANCELLATION_REASON,
  COD_MAX_ORDER_TOTAL,
  COD_RESTRICTION_CAUSE,
} from '../constants/cod.constant';

export type CodRestrictionCause =
  (typeof COD_RESTRICTION_CAUSE)[keyof typeof COD_RESTRICTION_CAUSE];
export type CodCancellationReason =
  (typeof COD_CANCELLATION_REASON)[keyof typeof COD_CANCELLATION_REASON];

export const placeCodSchema = z.strictObject({
  expectedTotal: vndAmountSchema,
});
export const codOrderTotalSchema = vndAmountSchema.max(COD_MAX_ORDER_TOTAL);
export const cancelCodSchema = z.strictObject({
  reason: z.literal(COD_CANCELLATION_REASON.CHANGE_OF_MIND),
});

export const codRestrictionsSchema = z.array(
  z.object({
    id: z.uuid(),
    cause: z.literal(COD_RESTRICTION_CAUSE.REPEATED_CANCELLATION),
    blockedUntil: dateTimeSchema.nullable(),
    resolvedAt: dateTimeSchema.nullable(),
    resolutionReason: z.string().nullable(),
    createdAt: dateTimeSchema,
  }),
);

export type PlaceCodInput = z.output<typeof placeCodSchema>;
export type CancelCodInput = z.output<typeof cancelCodSchema>;
