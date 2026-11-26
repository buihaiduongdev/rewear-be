import z from 'zod';

import { paginatedSchema } from '@/common/pagination';
import { dateTimeSchema } from '@/common/schemas/date-time.schema';

export const notificationResponseSchema = z.object({
  id: z.uuid(),
  recipientId: z.uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  entityType: z.string(),
  entityId: z.uuid(),
  isRead: z.boolean(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export type TNotificationResponse = z.output<typeof notificationResponseSchema>;

export const paginatedNotificationResponseSchema = paginatedSchema(
  notificationResponseSchema,
);

export const unreadCountResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});

export const markAllReadResponseSchema = z.object({
  updatedCount: z.number().int().nonnegative(),
});
