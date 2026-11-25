import z from 'zod';

import {
  RATING_MODERATION_BASES,
  RATING_MODES,
  RATING_POLICY,
} from '../constants/rating.constant';

export const ratingInputSchema = z.strictObject({
  orderId: z.uuid(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(5000).nullable().optional().default(null),
  mediaIds: z
    .array(z.uuid())
    .max(RATING_POLICY.MAX_MEDIA)
    .refine((ids) => new Set(ids).size === ids.length)
    .default([]),
});
export const ratingReplySchema = z.strictObject({
  text: z.string().trim().min(1).max(5000),
});
export const ratingModeSchema = z.enum(RATING_MODES).default('EVIDENCE');
export const ratingListSchema = z.strictObject({
  mode: ratingModeSchema,
  offset: z.coerce.number().int().nonnegative().max(100000).default(0),
});
export const ratingModerationSchema = z
  .strictObject({
    component: z.enum(['comment', 'media', 'reply', 'rating']),
    expectedRevision: z.number().int().positive().optional(),
    expectedReplyRevision: z.number().int().nonnegative().optional(),
    hidden: z.boolean(),
    basis: z.enum(RATING_MODERATION_BASES),
    reason: z.string().trim().min(3).max(2000),
    evidence: z.string().trim().min(3).max(5000),
  })
  .superRefine((input, ctx) => {
    if (
      !input.hidden &&
      (input.component === 'reply'
        ? input.expectedReplyRevision === undefined
        : input.expectedRevision === undefined)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Reviewed revision is required to restore hidden content',
      });
    const invalidBasis = input.hidden
      ? input.component === 'rating'
        ? !['FRAUD', 'INELIGIBLE'].includes(input.basis)
        : input.basis !== 'CONTENT_VIOLATION'
      : input.basis !== 'REVIEW_APPROVED';
    if (invalidBasis)
      ctx.addIssue({
        code: 'custom',
        message: 'Explicit verified moderation basis required',
      });
  });
export const ratingUploadSchema = z.strictObject({
  orderId: z.uuid(),
  mediaId: z.uuid(),
});
