import { randomUUID } from 'node:crypto';

import z from 'zod';

import * as schemas from '@/modules/chat/schemas/chat.schema';

describe('Chat contracts', () => {
  it('requires content and rejects sender impersonation, fake card fields and arbitrary media URLs', () => {
    expect(
      schemas.sendChatSchema.safeParse({ clientMessageId: randomUUID() })
        .success,
    ).toBe(false);
    expect(
      schemas.sendChatSchema.safeParse({
        clientMessageId: randomUUID(),
        text: 'Hello',
        senderSide: 'SHOP',
      }).success,
    ).toBe(false);
    expect(
      schemas.sendChatSchema.safeParse({
        clientMessageId: randomUUID(),
        card: { type: 'PRODUCT', id: randomUUID(), price: 1 },
      }).success,
    ).toBe(false);
    expect(
      schemas.sendChatSchema.safeParse({
        clientMessageId: randomUUID(),
        mediaIds: ['https://example.test/private'],
      }).success,
    ).toBe(false);
  });
  it('bounds text, cursor and upload size while accepting video', () => {
    expect(
      schemas.chatPageSchema.safeParse({ after: 1, before: 2 }).success,
    ).toBe(false);
    expect(schemas.chatPageSchema.safeParse({ limit: 101 }).success).toBe(
      false,
    );
    expect(
      schemas.chatUploadSchema.safeParse({
        mimeType: 'video/mp4',
        sizeBytes: 1024,
      }).success,
    ).toBe(true);
    expect(
      schemas.chatUploadSchema.safeParse({
        mimeType: 'image/jpeg',
        sizeBytes: 0,
      }).success,
    ).toBe(false);
  });
  it('exports only OpenAPI-compatible request/response schemas', () => {
    for (const schema of Object.values(schemas))
      expect(() => z.toJSONSchema(schema, { io: 'input' })).not.toThrow();
  });
});
