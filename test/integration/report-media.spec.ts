import { randomUUID } from 'node:crypto';

import type { StorageService } from '@/infrastructure/storage';
import { OutboxService } from '@/modules/event/outbox.service';
import { Media } from '@/modules/media/entities';
import { MediaService } from '@/modules/media/media.service';
import { ViolationReportService } from '@/modules/reports/violation-report.service';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Violation report private evidence PostgreSQL', () => {
  let database: TestDatabase;
  let reports: ViolationReportService;
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
    uploads = new MediaService(
      database.dataSource.getRepository(Media),
      storage as unknown as StorageService,
      {
        storage: {
          allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
          maxSizeBytes: 10 * 1024 * 1024,
        },
      } as never,
    );
    reports = new ViolationReportService(
      database.dataSource,
      new OutboxService(),
      storage as unknown as StorageService,
      uploads,
    );
  });

  afterAll(async () => database?.destroy());

  async function fixture() {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const ticket = await uploads.createUploadTicket(f.buyer.id, {
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      visibility: 'private',
    });
    return { ...f, db, ticket };
  }

  it('attaches owned media directly in create/supplement and signs only reporter/Admin reads', async () => {
    const f = await fixture();
    const report = await reports.create(f.buyer.id, {
      targetType: 'SHOP',
      targetId: f.shop.id,
      reason: 'FRAUD',
      description: 'Báo cáo kèm hình ảnh cần Admin xác minh',
      mediaIds: [f.ticket.mediaId],
    });
    expect(report.evidence).toHaveLength(1);
    expect(JSON.stringify(report)).not.toContain('storageKey');
    const evidenceId = report.evidence[0].id;
    await expect(
      reports.downloadEvidence(f.owner.id, evidenceId),
    ).rejects.toThrow('Report not found');
    expect(
      await reports.downloadEvidence(f.admin.id, evidenceId),
    ).toHaveProperty('url');
    expect(
      await reports.downloadEvidence(f.buyer.id, evidenceId),
    ).toHaveProperty('url');
    await expect(
      reports.create(f.buyer.id, {
        targetType: 'SHOP',
        targetId: f.shop.id,
        reason: 'FRAUD',
        description: 'Dùng lại media đã gắn cho báo cáo khác',
        mediaIds: [f.ticket.mediaId],
      }),
    ).rejects.toThrow('Upload ticket not found');

    const extraTicket = await uploads.createUploadTicket(f.buyer.id, {
      mimeType: 'image/png',
      sizeBytes: 1024,
      visibility: 'private',
    });
    const supplemented = await reports.supplement(f.buyer.id, report.id, {
      text: 'Bổ sung ảnh cho hồ sơ đang xét',
      mediaIds: [extraTicket.mediaId],
    });
    expect(supplemented.evidence).toHaveLength(2);
  });

  it('rejects another user’s media and unsupported report evidence mime types', async () => {
    const f = await fixture();
    const other = await adjudicationFixture(f.db);
    const otherTicket = await uploads.createUploadTicket(other.buyer.id, {
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      visibility: 'private',
    });
    await expect(
      reports.create(f.buyer.id, {
        targetType: 'SHOP',
        targetId: f.shop.id,
        reason: 'FRAUD',
        description: 'Không dùng ảnh upload của người khác',
        mediaIds: [otherTicket.mediaId],
      }),
    ).rejects.toThrow('Upload ticket not found');

    const avifTicket = await uploads.createUploadTicket(f.buyer.id, {
      mimeType: 'image/avif',
      sizeBytes: 1024,
      visibility: 'private',
    });
    await expect(
      reports.create(f.buyer.id, {
        targetType: 'SHOP',
        targetId: f.shop.id,
        reason: 'FRAUD',
        description: 'Kiểm tra loại ảnh không được hỗ trợ',
        mediaIds: [avifTicket.mediaId],
      }),
    ).rejects.toThrow('Unsupported report evidence type');
  });
});
