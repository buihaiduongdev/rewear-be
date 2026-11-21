import z from 'zod';

import { dateTimeSchema } from '@/common/schemas/date-time.schema';

import {
  NOTIFICATION_POLICY,
  NOTIFICATION_TARGET,
} from '../constants/notification.constant';

export const notificationQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(NOTIFICATION_POLICY.MAX_PAGE_SIZE)
    .default(NOTIFICATION_POLICY.DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export const notificationViewSchema = z.object({
  targetType: z.enum(NOTIFICATION_TARGET),
  id: z.uuid(),
  kind: z.string(),
  sourceId: z.uuid(),
  title: z.string(),
  body: z.string(),
  mode: z.enum(['EVIDENCE', 'SIMULATION']).nullable(),
  shopId: z.uuid().nullable(),
  readAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
});
export const notificationPageSchema = z.object({
  items: z.array(notificationViewSchema),
  total: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
});
export const unreadCountSchema = z.object({ count: z.number().int() });
export type NotificationQuery = z.output<typeof notificationQuerySchema>;
