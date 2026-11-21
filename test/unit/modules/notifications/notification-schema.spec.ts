import z from 'zod';

import {
  notificationPageSchema,
  notificationQuerySchema,
  notificationViewSchema,
} from '@/modules/notifications/schemas/notification.schema';

it('describes notification contracts using JSON-compatible dates and strict unread filtering', () => {
  for (const schema of [
    notificationPageSchema,
    notificationQuerySchema,
    notificationViewSchema,
  ])
    expect(() => z.toJSONSchema(schema, { io: 'input' })).not.toThrow();
  expect(
    notificationQuerySchema.parse({ unreadOnly: 'false' }).unreadOnly,
  ).toBe(false);
  expect(
    notificationQuerySchema.safeParse({ unreadOnly: 'arbitrary' }).success,
  ).toBe(false);
});
