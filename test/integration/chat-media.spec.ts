import { randomUUID } from 'node:crypto';

import type { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { ChatAccess } from '@/modules/chat/chat.access';
import { ChatService } from '@/modules/chat/chat.service';
import { ChatEvidenceLink } from '@/modules/chat/entities/chat-evidence.entity';
import { ChatMedia } from '@/modules/chat/entities/chat.entity';
import { ChatEvidenceService } from '@/modules/chat/media/chat-evidence.service';
import { ChatMediaService } from '@/modules/chat/media/chat-media.service';
import { DisputeAccess } from '@/modules/dispute/dispute.access';
import { DisputeIssue } from '@/modules/dispute/entities/dispute.entity';
import { OrderAccess } from '@/modules/order/order.access';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Chat private media and evidence PostgreSQL', () => {
  let database: TestDatabase;
  let service: ChatService;
  let media: ChatMediaService;
  let evidence: ChatEvidenceService;
  const objects = new Map<
    string,
    { eTag: string; contentType: string; sizeBytes: number }
  >();
  const storage = {
    assertConfigured: jest.fn(),
    createUploadTicket: jest.fn(
      async (input: {
        key: string;
        contentType: string;
        sizeBytes: number;
      }) => {
        objects.set(input.key, {
          eTag: randomUUID(),
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
        });
        return {
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
    const access = new ChatAccess(new AuthorizationService(db));
    service = new ChatService(db, access);
    media = new ChatMediaService(
      db,
      access,
      storage as unknown as PrivateEvidenceStorage,
    );
    evidence = new ChatEvidenceService(
      db,
      access,
      new DisputeAccess(new OrderAccess()),
      storage as unknown as PrivateEvidenceStorage,
    );
  });
  afterAll(async () => database?.destroy());
  it('allows received counterparty media as evidence while retaining the original uploader', async () => {
    const f = await fixture();
    const upload = await media.createUpload(f.owner.id, f.thread.id, {
      mimeType: 'video/mp4',
      sizeBytes: 1024,
    });
    await media.complete(f.owner.id, upload.id);
    await service.send(f.owner.id, f.thread.id, {
      clientMessageId: randomUUID(),
      mediaIds: [upload.id],
    });
    const imported = await evidence.import(f.buyer.id, upload.id, f.order.id, [
      'ISSUE',
    ]);
    const source = await database.dataSource.manager.findOneByOrFail(
      ChatMedia,
      { id: upload.id },
    );
    expect(source.uploadedById).toBe(f.owner.id);
    expect(
      await database.dataSource.manager.findOneByOrFail(ChatEvidenceLink, {
        evidenceId: imported.id,
      }),
    ).toMatchObject({ mediaId: upload.id, importedById: f.buyer.id });
  });
  async function fixture() {
    const f = await adjudicationFixture(database.dataSource);
    const thread = await service.open(f.buyer.id, f.shop.id);
    const upload = await media.createUpload(f.buyer.id, thread.id, {
      mimeType: 'video/mp4',
      sizeBytes: 1024,
    });
    return { ...f, thread, upload };
  }
  it('requires immutable completed uploads, attaches once and never exposes storage keys in messages', async () => {
    const f = await fixture();
    await expect(media.download(f.buyer.id, f.upload.id)).rejects.toThrow(
      'Attached chat media not found',
    );
    await expect(
      service.send(f.buyer.id, f.thread.id, {
        clientMessageId: randomUUID(),
        mediaIds: [f.upload.id],
      }),
    ).rejects.toThrow('owned ready uploads');
    await media.complete(f.buyer.id, f.upload.id);
    const sent = await service.send(f.buyer.id, f.thread.id, {
      clientMessageId: randomUUID(),
      mediaIds: [f.upload.id],
    });
    expect(JSON.stringify(sent)).not.toContain('storageKey');
    expect(sent.media).toEqual([
      expect.objectContaining({
        id: f.upload.id,
        mimeType: 'video/mp4',
        ready: true,
      }),
    ]);
    await expect(
      service.send(f.buyer.id, f.thread.id, {
        clientMessageId: randomUUID(),
        mediaIds: [f.upload.id],
      }),
    ).rejects.toThrow('owned ready uploads');
    expect(await media.download(f.owner.id, f.upload.id)).toHaveProperty('url');
  });
  it('denies other participants uploads, cross-conversation attachment and changed ETags', async () => {
    const f = await fixture();
    const other = await adjudicationFixture(database.dataSource);
    const thread = await service.open(other.buyer.id, f.shop.id);
    await expect(media.complete(f.owner.id, f.upload.id)).rejects.toThrow(
      'another sender',
    );
    await media.complete(f.buyer.id, f.upload.id);
    await expect(
      service.send(other.buyer.id, thread.id, {
        clientMessageId: randomUUID(),
        mediaIds: [f.upload.id],
      }),
    ).rejects.toThrow('owned ready uploads');
    await expect(media.download(other.buyer.id, f.upload.id)).rejects.toThrow(
      'Chat access denied',
    );
    const row = await database.dataSource.manager.findOneByOrFail(ChatMedia, {
      id: f.upload.id,
    });
    objects.get(row.storageKey)!.eTag = 'changed';
    await expect(media.complete(f.buyer.id, f.upload.id)).rejects.toThrow(
      'immutable upload',
    );
  });
  it('imports attached video as immutable dispute evidence idempotently with provenance', async () => {
    const f = await fixture();
    await media.complete(f.buyer.id, f.upload.id);
    await service.send(f.buyer.id, f.thread.id, {
      clientMessageId: randomUUID(),
      mediaIds: [f.upload.id],
    });
    const first = await evidence.import(f.buyer.id, f.upload.id, f.order.id, [
      'UNBOX',
    ]);
    const again = await evidence.import(f.buyer.id, f.upload.id, f.order.id, [
      'UNBOX',
    ]);
    expect(again.id).toBe(first.id);
    expect(first.status).toBe('READY');
    expect(
      await database.dataSource.manager.countBy(ChatEvidenceLink, {
        mediaId: f.upload.id,
        orderId: f.order.id,
        importedById: f.buyer.id,
      }),
    ).toBe(1);
    await database.dataSource.manager.update(DisputeIssue, f.issue.id, {
      status: 'RESOLVED_NO_REFUND',
    });
    expect(
      (await evidence.import(f.buyer.id, f.upload.id, f.order.id, ['UNBOX']))
        .id,
    ).toBe(first.id);
    await expect(
      evidence.import(f.buyer.id, f.upload.id, f.order.id, ['ISSUE']),
    ).rejects.toThrow('import tags changed');
  });
  it('rejects unattached evidence and media imported for an unrelated order', async () => {
    const f = await fixture();
    const other = await adjudicationFixture(database.dataSource);
    await media.complete(f.buyer.id, f.upload.id);
    await expect(
      evidence.import(f.buyer.id, f.upload.id, f.order.id, ['UNBOX']),
    ).rejects.toThrow('attached immutable object');
    await service.send(f.buyer.id, f.thread.id, {
      clientMessageId: randomUUID(),
      mediaIds: [f.upload.id],
    });
    await expect(
      evidence.import(f.buyer.id, f.upload.id, other.order.id, ['UNBOX']),
    ).rejects.toThrow('must belong');
  });
});
