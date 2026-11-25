import z from 'zod';

import { dateTimeSchema } from '@/common/schemas/date-time.schema';
import { DISPUTE_EVIDENCE_TAG } from '@/modules/dispute/constants/dispute.constant';

import {
  CHAT_CARD,
  CHAT_MIME_TYPES,
  CHAT_POLICY,
  CHAT_SIDE,
} from '../constants/chat.constant';

export type ChatSide = (typeof CHAT_SIDE)[keyof typeof CHAT_SIDE];
export type ChatCardType = (typeof CHAT_CARD)[keyof typeof CHAT_CARD];
export type ChatCardSnapshot = {
  type: ChatCardType;
  id: string;
  title?: string;
  price?: number | null;
  status: string;
};

export const openChatSchema = z.strictObject({ shopId: z.uuid() });
export const sendChatSchema = z
  .strictObject({
    clientMessageId: z.uuid(),
    text: z.string().trim().min(1).max(CHAT_POLICY.TEXT_LENGTH).optional(),
    mediaIds: z
      .array(z.uuid())
      .max(CHAT_POLICY.MAX_MEDIA)
      .default([])
      .refine((ids) => new Set(ids).size === ids.length, 'Duplicate media'),
    card: z.strictObject({ type: z.enum(CHAT_CARD), id: z.uuid() }).optional(),
  })
  .refine(
    (input) => !!input.text || input.mediaIds.length > 0 || !!input.card,
    'Message must contain text, media or a card',
  );
export const chatPageSchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(CHAT_POLICY.MAX_PAGE_SIZE)
      .default(CHAT_POLICY.DEFAULT_PAGE_SIZE),
    after: z.coerce.number().int().min(0).optional(),
    before: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (input) => input.after === undefined || input.before === undefined,
    'Use either after or before cursor',
  );
export const chatListSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CHAT_POLICY.MAX_PAGE_SIZE)
    .default(CHAT_POLICY.DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});
export const chatReadSchema = z.strictObject({
  throughSequence: z.number().int().min(0),
});
export const chatUploadSchema = z.strictObject({
  mimeType: z.enum(CHAT_MIME_TYPES),
  sizeBytes: z.number().int().positive(),
});
export const chatMediaViewSchema = z.object({
  id: z.uuid(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
});
export const chatMessageViewSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  sequence: z.number().int(),
  senderSide: z.enum(CHAT_SIDE),
  clientMessageId: z.uuid(),
  text: z.string().nullable(),
  media: z.array(chatMediaViewSchema),
  card: z
    .object({
      type: z.enum(CHAT_CARD),
      id: z.uuid(),
      title: z.string().optional(),
      price: z.number().nullable().optional(),
      status: z.string(),
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
  lastSequence: z.number().int(),
  readSequence: z.number().int(),
  peerReadSequence: z.number().int(),
  unreadCount: z.number().int(),
  lastMessageAt: dateTimeSchema.nullable(),
});
export const chatMessagePageSchema = z.object({
  items: z.array(chatMessageViewSchema),
  hasMore: z.boolean(),
  nextAfter: z.number().int().nullable(),
  nextBefore: z.number().int().nullable(),
});
export const chatConversationPageSchema = z.object({
  items: z.array(chatConversationViewSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export const chatUploadTicketSchema = z.object({
  id: z.uuid(),
  uploadUrl: z.url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresAt: dateTimeSchema,
});
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
