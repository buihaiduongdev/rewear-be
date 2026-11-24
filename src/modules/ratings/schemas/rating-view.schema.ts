import z from 'zod';

import { dateTimeSchema } from '@/common/schemas/date-time.schema';

import { RATING_MODES } from '../constants/rating.constant';

export const publicRatingSchema = z.object({
  id: z.uuid(),
  shopId: z.uuid(),
  stars: z.number().int(),
  comment: z.string().nullable(),
  mediaIds: z.array(z.uuid()),
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
export const ratingNoticeSchema = z.object({
  id: z.uuid(),
  ratingId: z.uuid(),
  shopId: z.uuid(),
  revision: z.number().int(),
  kind: z.string(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export const ratingMediaViewSchema = z.object({
  id: z.uuid(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
});
export const ratingDownloadSchema = z.object({
  url: z.url(),
  headers: z.record(z.string(), z.string()),
  expiresAt: dateTimeSchema,
});
