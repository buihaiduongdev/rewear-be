import { randomUUID } from 'node:crypto';

import type { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';
import { ReportEvidence } from '@/modules/reports/entities/report.entity';
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
    media = new ReportMediaService(
      database.dataSource,
      access,
      storage as unknown as PrivateEvidenceStorage,
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
    const upload = await media.createUpload(f.buyer.id, {
      targetType: 'SHOP',
      targetId: f.shop.id,
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    });
    return { ...f, db, upload };
  }
  it('allows only owned complete images of the same target and signs only attached reporter/Admin reads', async () => {
    const f = await fixture();
    const other = await adjudicationFixture(f.db);
    const input = {
      requestId: randomUUID(),
      targetType: 'SHOP' as const,
      targetId: f.shop.id,
      reason: 'FRAUD' as const,
      description: 'Báo cáo kèm hình ảnh cần Admin xác minh',
      evidenceIds: [f.upload.id],
    };
    await expect(reports.create(f.buyer.id, input)).rejects.toThrow(
      'owned ready uploads',
    );
    await expect(media.complete(other.buyer.id, f.upload.id)).rejects.toThrow(
      'Report upload not found',
    );
    await media.complete(f.buyer.id, f.upload.id);
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
    ).rejects.toThrow('owned ready uploads');
  });
  it('retains observed public target context when the Shop becomes unavailable after upload', async () => {
    const f = await fixture();
    await media.complete(f.buyer.id, f.upload.id);
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
    const extra = await media.createUpload(f.buyer.id, {
      targetType: 'SHOP',
      targetId: f.shop.id,
      reportId: result.id,
      mimeType: 'image/png',
      sizeBytes: 1024,
    });
    await media.complete(f.buyer.id, extra.id);
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
  it('rejects cross-target attachment, expired tickets and changed immutable ETag', async () => {
    const f = await fixture();
    const other = await adjudicationFixture(f.db);
    await media.complete(f.buyer.id, f.upload.id);
    await expect(
      reports.create(f.buyer.id, {
        requestId: randomUUID(),
        targetType: 'SHOP',
        targetId: other.shop.id,
        reason: 'FRAUD',
        description: 'Không dùng ảnh upload cho đối tượng khác',
        evidenceIds: [f.upload.id],
      }),
    ).rejects.toThrow('same target');
    const row = await f.db.manager.findOneByOrFail(ReportEvidence, {
      id: f.upload.id,
    });
    objects.get(row.storageKey)!.eTag = 'tampered';
    await expect(media.complete(f.buyer.id, f.upload.id)).rejects.toThrow(
      'immutable upload',
    );
    const expired = await media.createUpload(f.buyer.id, {
      targetType: 'SHOP',
      targetId: f.shop.id,
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    });
    await f.db.manager.update(ReportEvidence, expired.id, {
      uploadExpiresAt: new Date(0),
    });
    await expect(media.complete(f.buyer.id, expired.id)).rejects.toThrow(
      'ticket expired',
    );
  });
});
