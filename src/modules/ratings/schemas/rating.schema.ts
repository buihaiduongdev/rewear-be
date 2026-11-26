import z from 'zod';

import { dateTimeSchema } from '@/common/schemas/date-time.schema';

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
    hidden: z.boolean(),
    basis: z.enum(RATING_MODERATION_BASES),
    reason: z.string().trim().min(3).max(2000),
    evidence: z.string().trim().min(3).max(5000),
  })
  .superRefine((input, ctx) => {
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

export const publicRatingSchema = z.object({
  id: z.uuid(),
  shopId: z.uuid(),
  stars: z.number().int(),
  comment: z.string().nullable(),
  mediaIds: z.array(z.uuid()),
  mediaUrls: z.array(z.string()).default([]),
  reply: z.string().nullable(),
  revision: z.number().int(),
  updatedAt: dateTimeSchema,
  mode: z.enum(RATING_MODES),
  verifiedTransaction: z.boolean(),
});
export const privateRatingSchema = publicRatingSchema.extend({
  orderId: z.uuid(),
  replyRevision: z.number().int(),
  commentHidden: z.boolean(),
  mediaHidden: z.boolean(),
  replyHidden: z.boolean(),
  invalidated: z.boolean(),
  createdAt: dateTimeSchema,
});
export const shopReplyRatingSchema = publicRatingSchema.extend({
  replyHidden: z.boolean(),
  replyRevision: z.number().int(),
});
export const publicRatingPageSchema = z.object({
  summary: z.object({
    mode: z.enum(RATING_MODES),
    count: z.number().int(),
    average: z.number().nullable(),
    distribution: z.record(z.string(), z.number()),
    verifiedBuyerCount: z.number().int(),
  }),
  ratings: z.array(publicRatingSchema),
});
export const ratingVersionSchema = z.object({
  id: z.uuid(),
  ratingId: z.uuid(),
  actorId: z.uuid(),
  kind: z.enum(['BUYER', 'REPLY']),
  revision: z.number().int(),
  snapshot: z.record(z.string(), z.unknown()),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export type RatingMode = (typeof RATING_MODES)[number];
export type RatingInput = z.infer<typeof ratingInputSchema>;
export type RatingModerationInput = z.infer<typeof ratingModerationSchema>;
