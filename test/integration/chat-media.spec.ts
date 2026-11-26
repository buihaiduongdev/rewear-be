import { randomUUID } from 'node:crypto';

import type { StorageService } from '@/infrastructure/storage';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { ChatService } from '@/modules/chat/chat.service';
import { OutboxService } from '@/modules/event/outbox.service';
import { Media } from '@/modules/media/entities';
import { MediaService } from '@/modules/media/media.service';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Chat private media PostgreSQL', () => {
  let database: TestDatabase;
  let service: ChatService;
  let uploads: MediaService;
  const objects = new Map<
    string,
    { eTag: string; contentType: string; sizeBytes: number }
  >();
  const storage = {
    assertConfigured: jest.fn(),
    createUploadTicket: jest.fn(
      async (input: {
        keyPrefix: string;
        extension: string;
        contentType: string;
        sizeBytes: number;
      }) => {
        const key = `${input.keyPrefix}/${randomUUID()}.${input.extension}`;
        objects.set(key, {
          eTag: randomUUID(),
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
        });
        return {
          key,
          uploadUrl: 'https://private.test/upload',
          method: 'PUT' as const,
          headers: { 'If-None-Match': '*' },
          expiresAt: new Date(Date.now() + 60000),
        };
      },
    ),
    getObjectMetadata: jest.fn(async (key: string) => objects.get(key)!),
    createDownloadUrl: jest.fn(async () => ({
      url: 'https://private.test/read',
      headers: { 'If-Match': 'immutable' },
      expiresAt: new Date(Date.now() + 60000),
    })),
  };
  beforeAll(async () => {
    database = await createTestDatabase();
    const db = database.dataSource;
    const authorization = new AuthorizationService(db);
    uploads = new MediaService(
      db.getRepository(Media),
      storage as unknown as StorageService,
      {
        storage: {
          allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
          maxSizeBytes: 10 * 1024 * 1024,
        },
      } as never,
    );
    service = new ChatService(
      db,
      authorization,
      uploads,
      new OutboxService(),
      storage as unknown as StorageService,
    );
  });
  afterAll(async () => database?.destroy());
  async function fixture() {
    const f = await adjudicationFixture(database.dataSource);
    const thread = await service.open(f.buyer.id, f.shop.id);
    const ticket = await uploads.createUploadTicket(f.buyer.id, {
      mimeType: 'video/mp4',
      sizeBytes: 1024,
      visibility: 'private',
    });
    const upload = { id: ticket.mediaId };
    return { ...f, thread, upload };
  }
  it('attaches owned media once and never exposes storage keys in messages', async () => {
    const f = await fixture();
    await expect(service.download(f.buyer.id, f.upload.id)).rejects.toThrow(
      'Attached chat media not found',
    );
    const sent = await service.send(f.buyer.id, f.thread.id, {
      mediaIds: [f.upload.id],
    });
    expect(JSON.stringify(sent)).not.toContain('storageKey');
    expect(sent.media).toEqual([
      expect.objectContaining({
        id: f.upload.id,
        mimeType: 'video/mp4',
      }),
    ]);
    await expect(
      service.send(f.buyer.id, f.thread.id, {
        mediaIds: [f.upload.id],
      }),
    ).rejects.toThrow('Upload ticket not found or already attached');
    expect(await service.download(f.owner.id, f.upload.id)).toHaveProperty(
      'url',
    );
  });
  it('denies other users attaching or viewing media', async () => {
    const f = await fixture();
    const other = await adjudicationFixture(database.dataSource);
    const thread = await service.open(other.buyer.id, f.shop.id);
    await expect(
      service.send(other.buyer.id, thread.id, {
        mediaIds: [f.upload.id],
      }),
    ).rejects.toThrow('Upload ticket not found or already attached');
    await service.send(f.buyer.id, f.thread.id, {
      mediaIds: [f.upload.id],
    });
    await expect(service.download(other.buyer.id, f.upload.id)).rejects.toThrow(
      'Chat access denied',
    );
  });
});
