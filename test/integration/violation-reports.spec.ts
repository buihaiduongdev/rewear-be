import { randomUUID } from 'node:crypto';

import type { StorageService } from '@/infrastructure/storage';
import { Category } from '@/modules/category/entities';
import { OutboxService } from '@/modules/event/outbox.service';
import type { MediaService } from '@/modules/media/media.service';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { ViolationReport } from '@/modules/reports/entities';
import { ViolationReportService } from '@/modules/reports/violation-report.service';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase, type TestDatabase } from '../support/database';

describe('Product/Shop violation reports PostgreSQL', () => {
  let database: TestDatabase;
  let service: ViolationReportService;
  let admin: ViolationReportService;
  let read: ViolationReportService;

  beforeAll(async () => {
    database = await createTestDatabase();
    service = new ViolationReportService(
      database.dataSource,
      new OutboxService(),
      {} as StorageService,
      {} as MediaService,
    );
    read = service;
    admin = service;
  });

  afterAll(async () => database?.destroy());

  async function productFixture() {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const category = await db.manager.save(
      Category,
      db.manager.create(Category, {
        name: 'Reports category',
        slug: randomUUID(),
        isActive: true,
      }),
    );
    const product = await db.manager.save(
      Product,
      db.manager.create(Product, {
        shopId: f.shop.id,
        categoryId: category.id,
        title: 'Public listing',
        price: 100000,
        status: ProductStatus.ACTIVE,
        publishedAt: new Date(),
      }),
    );
    const moderation = await db.manager.save(
      ProductModeration,
      db.manager.create(ProductModeration, {
        productId: product.id,
        status: ProductModerationStatus.APPROVED,
        version: 1,
      }),
    );
    const report = await service.create(f.buyer.id, {
      targetType: 'PRODUCT',
      targetId: product.id,
      reason: 'COUNTERFEIT',
      description: 'Có dấu hiệu hàng giả cần xác minh',
      mediaIds: [],
    });
    return { ...f, db, product, moderation, report };
  }

  it('applies Product suspension in the same transaction as the confirmed decision', async () => {
    const f = await productFixture();
    const input = {
      expectedTargetVersion: 1,
      outcome: 'CONFIRMED' as const,
      action: 'SUSPEND_PRODUCT' as const,
      reason: 'Đã xác minh hàng giả',
      adminNote: 'Private reporter assessment',
    };
    const result = await admin.resolve(f.admin.id, f.report.id, input);
    expect(result.resolution?.action).toBe('SUSPEND_PRODUCT');
    expect(
      await f.db.manager.findOneByOrFail(Product, { id: f.product.id }),
    ).toMatchObject({ status: ProductStatus.SUSPENDED });
    expect(
      await f.db.manager.findOneByOrFail(ProductModeration, {
        productId: f.product.id,
      }),
    ).toMatchObject({
      status: ProductModerationStatus.SUSPENDED,
      reason: input.reason,
    });
    expect(
      JSON.stringify(await read.mineDetail(f.buyer.id, f.report.id)),
    ).not.toContain(input.adminNote);
    await expect(admin.resolve(f.admin.id, f.report.id, input)).rejects.toThrow(
      'Report already resolved',
    );
  });

  it('rejects stale target review and preserves held stock and report state when a measure fails', async () => {
    const f = await productFixture();
    await f.db.manager.update(ProductModeration, f.moderation.id, {
      version: 2,
    });
    const input = {
      expectedTargetVersion: 1,
      outcome: 'CONFIRMED' as const,
      action: 'SUSPEND_PRODUCT' as const,
      reason: 'Vi phạm đã được xác nhận',
      adminNote: '',
    };
    await expect(admin.resolve(f.admin.id, f.report.id, input)).rejects.toThrow(
      'Product moderation snapshot changed',
    );
    await f.db.manager.update(Product, f.product.id, {
      status: ProductStatus.HELD,
      reservedOrderId: f.order.id,
    });
    await expect(
      admin.resolve(f.admin.id, f.report.id, {
        ...input,
        expectedTargetVersion: 2,
      }),
    ).rejects.toThrow('Only an available listing');
    expect(
      await f.db.manager.findOneByOrFail(ViolationReport, { id: f.report.id }),
    ).toMatchObject({ status: 'OPEN' });
    await admin.resolve(f.admin.id, f.report.id, {
      ...input,
      action: 'NONE',
      expectedTargetVersion: undefined,
    });
    expect(
      await f.db.manager.findOneByOrFail(Product, { id: f.product.id }),
    ).toMatchObject({
      status: ProductStatus.HELD,
      reservedOrderId: f.order.id,
    });
  });

  it('appends reporter supplements and keeps resolved reports immutable', async () => {
    const f = await productFixture();
    const input = {
      text: 'Bổ sung thông tin quan trọng để Admin xét',
      mediaIds: [],
    };
    const updated = await service.supplement(f.buyer.id, f.report.id, input);
    expect(updated.description).toContain(input.text);
    await admin.resolve(f.admin.id, f.report.id, {
      outcome: 'DISMISSED',
      action: 'NONE',
      reason: 'Không có đủ căn cứ vi phạm',
      adminNote: 'Internal review note',
    });
    await expect(
      service.supplement(f.buyer.id, f.report.id, input),
    ).rejects.toThrow('Closed reports');
  });

  it('keeps personal privacy and enforces reporter and Admin access', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const other = await adjudicationFixture(db);
    const report = await service.create(f.buyer.id, {
      targetType: 'SHOP',
      targetId: f.shop.id,
      reason: 'FRAUD',
      description: 'Shop có dấu hiệu lừa đảo cần kiểm tra',
      mediaIds: [],
    });
    await expect(read.mineDetail(other.buyer.id, report.id)).rejects.toThrow(
      'Report not found',
    );
    await expect(read.adminDetail(f.owner.id, report.id)).rejects.toThrow(
      'Active Admin required',
    );
    expect(report).not.toHaveProperty('adminNote');
    expect(report).not.toHaveProperty('reporterId');
    expect(report.status).toBe('OPEN');
  });

  it('allows report context from the reporters own historical order without exposing current private edits', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const other = await adjudicationFixture(db);
    const productId = f.order.items[0].productId;
    const product = await db.manager.save(
      Product,
      db.manager.create(Product, {
        id: productId,
        shopId: f.shop.id,
        categoryId: null,
        status: ProductStatus.DRAFT,
        title: 'PRIVATE NEW TITLE',
        price: 300000,
      }),
    );
    const report = await service.create(f.buyer.id, {
      targetType: 'PRODUCT',
      targetId: product.id,
      reason: 'MISLEADING_CONTENT',
      description: 'Nội dung hàng đã mua sai mô tả',
      mediaIds: [],
    });
    expect(JSON.stringify(report.target)).not.toContain('PRIVATE');
    expect(report.target.label).toBe('Jacket snapshot');
    await expect(
      service.create(other.buyer.id, {
        targetType: 'PRODUCT',
        targetId: product.id,
        reason: 'FRAUD',
        description: 'Không được truy cập nội dung private',
        mediaIds: [],
      }),
    ).rejects.toThrow('Report target not available');
  });

  it('claims, resolves, and atomically deactivates Shop while enforcing Admin authority', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const report = await service.create(f.buyer.id, {
      targetType: 'SHOP',
      targetId: f.shop.id,
      reason: 'PROHIBITED_ITEM',
      description: 'Shop bán hàng cấm cần Admin xác minh',
      mediaIds: [],
    });
    const claimed = await admin.claim(f.admin.id, report.id);
    expect(claimed.status).toBe('IN_REVIEW');
    const result = await admin.resolve(f.admin.id, report.id, {
      outcome: 'CONFIRMED',
      action: 'DEACTIVATE_SHOP',
      reason: 'Đã xác minh vi phạm',
      adminNote: 'Private admin note',
    });
    expect(result.status).toBe('RESOLVED');
    expect(
      (await db.manager.findOneByOrFail(Shop, { id: f.shop.id })).status,
    ).toBe(ShopStatus.INACTIVE);
    expect(await read.mineDetail(f.buyer.id, report.id)).not.toHaveProperty(
      'adminNote',
    );
    await db.manager.update(User, f.admin.id, { role: UserRole.USER });
    await expect(
      admin.resolve(f.admin.id, report.id, {
        outcome: 'CONFIRMED',
        action: 'DEACTIVATE_SHOP',
        reason: 'Đã xác minh vi phạm',
        adminNote: 'Private admin note',
      }),
    ).rejects.toThrow('Active Admin required');
  });
});
