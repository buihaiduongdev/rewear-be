import z from 'zod';

export const FEE_DISCLOSURE_KINDS = [
  'CANCELLATION',
  'FAILED_DELIVERY',
  'SELLER_PACKAGE_ERROR',
  'RETURN_SHIPPING',
  'REFUSAL_EXTRA',
] as const;
export const feePolicyPublishSchema = z.strictObject({
  conditions: z
    .array(
      z.strictObject({
        kind: z.enum(FEE_DISCLOSURE_KINDS),
        text: z.string().trim().min(20).max(10000),
      }),
    )
    .min(1)
    .max(5)
    .refine(
      (rows) => new Set(rows.map((row) => row.kind)).size === rows.length,
      'Duplicate conditions',
    ),
});
export const feePolicyAcceptanceSchema = z.strictObject({
  policyId: z.uuid(),
  accepted: z.literal(true),
});
export const feeDisclosureSchema = z.object({
  policyId: z.uuid(),
  version: z.number().int().positive(),
  publishedAt: z.iso.datetime(),
  buyerAcceptedAt: z.iso.datetime().nullable(),
  sellers: z.record(
    z.string(),
    z.object({ sellerAcceptedAt: z.iso.datetime(), ownerId: z.uuid() }),
  ),
});
export type FeeDisclosure = z.infer<typeof feeDisclosureSchema>;
export type FeePolicyPublishInput = z.infer<typeof feePolicyPublishSchema>;
