import z from 'zod';

import * as schemas from '@/modules/chat/schemas/chat.schema';

describe('Chat contracts', () => {
  it('requires content and rejects unknown fields and arbitrary media URLs', () => {
    expect(schemas.sendChatSchema.safeParse({}).success).toBe(false);
    expect(
      schemas.sendChatSchema.safeParse({
        text: 'Hello',
        senderSide: 'SHOP',
      }).success,
    ).toBe(false);
    expect(
      schemas.sendChatSchema.safeParse({
        mediaIds: ['https://example.test/private'],
      }).success,
    ).toBe(false);
    expect(
      schemas.sendChatSchema.safeParse({
        text: 'Hello',
      }).success,
    ).toBe(true);
  });
  it('bounds pagination and upload size while accepting video', () => {
    expect(schemas.chatPageSchema.safeParse({ limit: 101 }).success).toBe(
      false,
    );
    expect(schemas.chatPageSchema.safeParse({ offset: -1 }).success).toBe(
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
