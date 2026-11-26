import { randomUUID } from 'node:crypto';

import type { StorageService } from '@/infrastructure/storage';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { ChatMediaService } from '@/modules/chat/chat-media.service';
import { ChatService } from '@/modules/chat/chat.service';
import { DisputeAccess } from '@/modules/dispute/dispute.access';
import { DisputeEvidence } from '@/modules/dispute/entities/dispute-evidence.entity';
import { DisputeIssue } from '@/modules/dispute/entities/dispute-issue.entity';
import { OutboxService } from '@/modules/event/outbox.service';
import { Media } from '@/modules/media/entities';
import { MediaService } from '@/modules/media/media.service';
import { OrderAccess } from '@/modules/order/order.access';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Chat private media and evidence PostgreSQL', () => {
  let database: TestDatabase;
  let service: ChatService;
  let media: ChatMediaService;
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
    service = new ChatService(db, authorization, uploads, new OutboxService());
    media = new ChatMediaService(
      db,
      service,
      storage as unknown as StorageService,
      new DisputeAccess(new OrderAccess()),
    );
  });
  afterAll(async () => database?.destroy());
  it('allows received counterparty media as evidence while retaining the original uploader', async () => {
    const f = await fixture();
    const ticket = await uploads.createUploadTicket(f.owner.id, {
      mimeType: 'video/mp4',
      sizeBytes: 1024,
      visibility: 'private',
    });
    const upload = { id: ticket.mediaId };
    await service.send(f.owner.id, f.thread.id, {
      mediaIds: [upload.id],
    });
    const imported = await media.importEvidence(
      f.buyer.id,
      upload.id,
      f.order.id,
      ['ISSUE'],
    );
    const source = await database.dataSource.manager.findOneByOrFail(Media, {
      id: upload.id,
    });
    expect(source.uploadedById).toBe(f.owner.id);
    expect(
      await database.dataSource.manager.findOneByOrFail(DisputeEvidence, {
        id: imported.id,
      }),
    ).toMatchObject({ mediaId: upload.id, uploadedById: f.buyer.id });
  });
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
    await expect(media.download(f.buyer.id, f.upload.id)).rejects.toThrow(
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
    expect(await media.download(f.owner.id, f.upload.id)).toHaveProperty('url');
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
    await expect(media.download(other.buyer.id, f.upload.id)).rejects.toThrow(
      'Chat access denied',
    );
  });
  it('imports attached video as dispute evidence idempotently with provenance', async () => {
    const f = await fixture();
    await service.send(f.buyer.id, f.thread.id, {
      mediaIds: [f.upload.id],
    });
    const first = await media.importEvidence(
      f.buyer.id,
      f.upload.id,
      f.order.id,
      ['UNBOX'],
    );
    const again = await media.importEvidence(
      f.buyer.id,
      f.upload.id,
      f.order.id,
      ['UNBOX'],
    );
    expect(again.id).toBe(first.id);
    expect(
      await database.dataSource.manager.countBy(DisputeEvidence, {
        mediaId: f.upload.id,
        orderId: f.order.id,
        uploadedById: f.buyer.id,
      }),
    ).toBe(1);
    await database.dataSource.manager.update(DisputeIssue, f.issue.id, {
      status: 'RESOLVED_NO_REFUND',
    });
    expect(
      (
        await media.importEvidence(f.buyer.id, f.upload.id, f.order.id, [
          'UNBOX',
        ])
      ).id,
    ).toBe(first.id);
    await expect(
      media.importEvidence(f.buyer.id, f.upload.id, f.order.id, ['ISSUE']),
    ).rejects.toThrow('import tags changed');
  });
  it('rejects unattached evidence and media imported for an unrelated order', async () => {
    const f = await fixture();
    const other = await adjudicationFixture(database.dataSource);
    await expect(
      media.importEvidence(f.buyer.id, f.upload.id, f.order.id, ['UNBOX']),
    ).rejects.toThrow('Chat media not found');
    await service.send(f.buyer.id, f.thread.id, {
      mediaIds: [f.upload.id],
    });
    await expect(
      media.importEvidence(f.buyer.id, f.upload.id, other.order.id, ['UNBOX']),
    ).rejects.toThrow('must belong');
  });
});
