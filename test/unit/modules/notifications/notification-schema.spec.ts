import z from 'zod';

import {
  markAllReadResponseSchema,
  notificationResponseSchema,
  paginatedNotificationResponseSchema,
  unreadCountResponseSchema,
} from '@/modules/notifications/schemas/notification.schema';

it('describes notification contracts using JSON-compatible dates', () => {
  for (const schema of [
    notificationResponseSchema,
    paginatedNotificationResponseSchema,
    unreadCountResponseSchema,
    markAllReadResponseSchema,
  ])
    expect(() => z.toJSONSchema(schema, { io: 'input' })).not.toThrow();
});
