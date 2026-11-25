import { randomUUID } from 'node:crypto';

import type { StorageService } from '@/infrastructure/storage';
import { Media } from '@/modules/media/entities';
import { MediaService } from '@/modules/media/media.service';
import { ReportMediaService } from '@/modules/reports/media/report-media.service';
import { ReportReadService } from '@/modules/reports/report-read.service';
import { ReportAccess } from '@/modules/reports/report.access';
import { ViolationReportService } from '@/modules/reports/violation-report.service';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Violation report private evidence PostgreSQL', () => {
  let database: TestDatabase;
  let media: ReportMediaService;
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
    const access = new ReportAccess();
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
    media = new ReportMediaService(
      database.dataSource,
      access,
      storage as unknown as StorageService,
      uploads,
    );
    reports = new ViolationReportService(
      database.dataSource,
      access,
      new ReportReadService(database.dataSource, access),
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
    const upload = await media.attach(f.buyer.id, {
      targetType: 'SHOP',
      targetId: f.shop.id,
      mediaId: ticket.mediaId,
    });
    return { ...f, db, upload };
  }
  it('allows owned evidence and signs only attached reporter/Admin reads', async () => {
    const f = await fixture();
    const input = {
      requestId: randomUUID(),
      targetType: 'SHOP' as const,
      targetId: f.shop.id,
      reason: 'FRAUD' as const,
      description: 'Báo cáo kèm hình ảnh cần Admin xác minh',
      evidenceIds: [f.upload.id],
    };
    await expect(media.download(f.buyer.id, f.upload.id)).rejects.toThrow(
      'Attached report evidence',
    );
    const report = await reports.create(f.buyer.id, input);
    expect(report.evidence[0].id).toBe(f.upload.id);
    expect(JSON.stringify(report)).not.toContain('storageKey');
    await expect(media.download(f.owner.id, f.upload.id)).rejects.toThrow(
      'Report not found',
    );
    expect(await media.download(f.admin.id, f.upload.id)).toHaveProperty('url');
    expect(await media.download(f.buyer.id, f.upload.id)).toHaveProperty('url');
    await expect(
      reports.create(f.buyer.id, { ...input, requestId: randomUUID() }),
    ).rejects.toThrow('belong to the reporter');
  });
  it('retains observed public target context when the Shop becomes unavailable after upload', async () => {
    const f = await fixture();
    await f.db.manager.update(Shop, f.shop.id, {
      status: ShopStatus.INACTIVE,
      name: 'PRIVATE CHANGED NAME',
    });
    const result = await reports.create(f.buyer.id, {
      requestId: randomUUID(),
      targetType: 'SHOP',
      targetId: f.shop.id,
      reason: 'FRAUD',
      description: 'Hình đã tải trước khi Shop ngừng công khai',
      evidenceIds: [f.upload.id],
    });
    expect(result.target.label).toBe(f.shop.name);
    expect(result.target.label).not.toContain('PRIVATE');
    const extraTicket = await uploads.createUploadTicket(f.buyer.id, {
      mimeType: 'image/png',
      sizeBytes: 1024,
      visibility: 'private',
    });
    const extra = await media.attach(f.buyer.id, {
      targetType: 'SHOP',
      targetId: f.shop.id,
      reportId: result.id,
      mediaId: extraTicket.mediaId,
    });
    expect(
      (
        await reports.supplement(f.buyer.id, result.id, {
          requestId: randomUUID(),
          text: 'Bổ sung ảnh cho hồ sơ đang xét',
          evidenceIds: [extra.id],
        })
      ).evidence,
    ).toHaveLength(2);
  });
  it('rejects cross-target attachment and another user’s upload', async () => {
    const f = await fixture();
    const other = await adjudicationFixture(f.db);
    await expect(
      reports.create(f.buyer.id, {
        requestId: randomUUID(),
        targetType: 'SHOP',
        targetId: other.shop.id,
        reason: 'FRAUD',
        description: 'Không dùng ảnh upload cho đối tượng khác',
        evidenceIds: [f.upload.id],
      }),
    ).rejects.toThrow('match the target');
    const otherTicket = await uploads.createUploadTicket(other.buyer.id, {
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      visibility: 'private',
    });
    await expect(
      media.attach(f.buyer.id, {
        targetType: 'SHOP',
        targetId: f.shop.id,
        mediaId: otherTicket.mediaId,
      }),
    ).rejects.toThrow('Upload ticket not found');
  });
});
