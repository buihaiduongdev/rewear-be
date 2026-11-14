import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';

export const placeCodSchema = z.strictObject({
  expectedTotal: z.number().int().nonnegative().max(2147483647),
});
export const codOrderTotalSchema = z.number().int().nonnegative().max(50000000);
export const cancelCodSchema = z.strictObject({
  reason: z.literal('CHANGE_OF_MIND'),
});
export type PlaceCodInput = z.output<typeof placeCodSchema>;
export type CancelCodInput = z.output<typeof cancelCodSchema>;
export const codRestrictionsSchema = z.array(
  z.object({
    id: z.uuid(),
    cause: z.literal('REPEATED_CANCELLATION'),
    blockedUntil: dateTimeSchema.nullable(),
    resolvedAt: dateTimeSchema.nullable(),
    resolutionReason: z.string().nullable(),
    createdAt: dateTimeSchema,
  }),
);
