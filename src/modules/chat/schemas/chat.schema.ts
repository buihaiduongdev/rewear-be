import z from 'zod';

import { dateTimeSchema } from '@/common/schemas/date-time.schema';
import { DISPUTE_EVIDENCE_TAG } from '@/modules/dispute/constants/dispute.constant';

import {
  CHAT_MIME_TYPES,
  CHAT_POLICY,
  CHAT_SIDE,
} from '../constants/chat.constant';

export type ChatSide = (typeof CHAT_SIDE)[keyof typeof CHAT_SIDE];

const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  });

export const openChatSchema = z.strictObject({ shopId: z.uuid() });
export const sendChatSchema = z
  .strictObject({
    text: z.string().trim().min(1).max(CHAT_POLICY.TEXT_LENGTH).optional(),
    mediaIds: z
      .array(z.uuid())
      .max(CHAT_POLICY.MAX_MEDIA)
      .default([])
      .refine((ids) => new Set(ids).size === ids.length, 'Duplicate media'),
    productId: z.uuid().optional(),
    orderId: z.uuid().optional(),
  })
  .refine(
    (input) =>
      !!input.text ||
      input.mediaIds.length > 0 ||
      !!input.productId ||
      !!input.orderId,
    'Message must contain text, media, a product or an order',
  );
export const chatPageSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CHAT_POLICY.MAX_PAGE_SIZE)
    .default(CHAT_POLICY.DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});
export const chatUploadSchema = z.strictObject({
  mimeType: z.enum(CHAT_MIME_TYPES),
  sizeBytes: z.number().int().positive(),
});

export const chatMessageViewSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  senderId: z.uuid(),
  text: z.string().nullable(),
  media: z.array(
    z.object({
      id: z.uuid(),
      mimeType: z.string(),
      sizeBytes: z.number().int(),
    }),
  ),
  product: z
    .object({
      id: z.uuid(),
      title: z.string(),
      price: z.number().nullable(),
      status: z.string(),
    })
    .nullable(),
  orderId: z.uuid().nullable(),
  order: z
    .object({
      id: z.uuid(),
      orderCode: z.string(),
      status: z.string(),
      total: z.number().int(),
      itemCount: z.number().int(),
    })
    .nullable(),
  createdAt: dateTimeSchema,
});
export const chatConversationViewSchema = z.object({
  id: z.uuid(),
  buyerId: z.uuid(),
  buyerName: z.string(),
  shopId: z.uuid(),
  shopName: z.string(),
  side: z.enum(CHAT_SIDE),
  unreadCount: z.number().int(),
  lastMessageAt: dateTimeSchema.nullable(),
});
export const chatMessagePageSchema = pageOf(chatMessageViewSchema);
export const chatConversationPageSchema = pageOf(chatConversationViewSchema);
export const chatDownloadSchema = z.object({
  url: z.url(),
  headers: z.record(z.string(), z.string()),
  expiresAt: dateTimeSchema,
});
export const importEvidenceSchema = z.strictObject({
  orderId: z.uuid(),
  tags: z
    .array(z.enum(DISPUTE_EVIDENCE_TAG))
    .min(1)
    .max(7)
    .refine(
      (tags) => new Set(tags).size === tags.length,
      'Duplicate evidence tags',
    ),
});
export const importedEvidenceViewSchema = z.object({
  id: z.uuid(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  tags: z.array(z.string()),
});

export type SendChatInput = z.infer<typeof sendChatSchema>;
export type ChatPageInput = z.infer<typeof chatPageSchema>;
