import z from 'zod';

import { MediaRole, MediaType } from '../enums';

export const mediaSchema = z.object({
  id: z.uuid(),
  url: z.url(),
  mediaType: z.enum(MediaType),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  role: z.enum(MediaRole),
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const mediaListSchema = z.array(mediaSchema);

export const mediaUploadTicketSchema = z.object({
  storageKey: z.string(),
  uploadUrl: z.url(),
  publicUrl: z.url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.coerce.date(),
});
