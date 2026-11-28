import { randomUUID } from 'node:crypto';

import { StorageService } from '@/infrastructure/storage';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { ShopRoleService } from '@/modules/authorization/shop-role.service';
import { Category } from '@/modules/category/entities';
import { OutboxService } from '@/modules/event/outbox.service';
import { Media } from '@/modules/media/entities';
import { MediaType } from '@/modules/media/enums';
import { MediaService } from '@/modules/media/media.service';
import { Product } from '@/modules/product/entities';
import { ProductService } from '@/modules/product/product.service';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { ShopBankAccount } from '@/modules/shop-finance/entities';
import {
  OwnerIdentity,
  ShopApplicationDocument,
} from '@/modules/shop/applications/entities';
import { ShopApplicationService } from '@/modules/shop/applications/shop-application.service';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';
import { ShopService } from '@/modules/shop/shop.service';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Shop Owner application (PostgreSQL)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let service: ShopApplicationService;
  let shops: ShopService;
  let uploads: MediaService;

  const storage = {
    getPublicUrl: (key: string) => `https://public.test/${key}`,
    assertConfigured: jest.fn(),
    createUploadTicket: jest.fn(async () => ({
      key: `uploads/${randomUUID()}.jpg`,
      uploadUrl: 'https://private.test/put',
      method: 'PUT',
      headers: { 'If-None-Match': '*' },
      expiresAt: new Date(Date.now() + 60000),
    })),
    getObjectMetadata: jest.fn(async () => ({
      eTag: 'immutable',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    })),
    createDownloadUrl: jest.fn(async () => ({
      url: 'https://private.test/read',
      headers: { 'If-Match': 'immutable' },
      expiresAt: new Date(Date.now() + 60000),
    })),
  };

  beforeAll(async () => {
    database = await createTestDatabase();
    const db = database.dataSource;
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
    const outbox = new OutboxService();
    service = new ShopApplicationService(
      db,
      storage as unknown as StorageService,
      uploads,
      outbox,
    );
    shops = new ShopService(
      db.getRepository(Shop),
      db.getRepository(ShopMember),
      db,
      new ShopRoleService(db),
      uploads,
      storage as unknown as StorageService,
      outbox,
    );
  });

  afterAll(async () => database?.destroy());

  async function fixture() {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const logo = await db.getRepository(Media).save({
      uploadedById: f.owner.id,
      storageKey: `logos/${randomUUID()}.jpg`,
      visibility: 'public',
      mediaType: MediaType.IMAGE,
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      isAttached: true,
    });
    await db.getRepository(Shop).update(
      { id: f.shop.id },
      {
        status: ShopStatus.PENDING,
        onboardingRequired: true,
        approvedAt: null,
        logoMediaId: logo.id,
      },
    );
    await db.getRepository(PickupLocation).save({
      shopId: f.shop.id,
      contactName: 'Owner pickup',
      phone: '0901234567',
      addressLine1: '12 Test street',
      provinceId: 201,
      districtId: 1485,
      districtName: 'District',
      provinceName: 'Province',
      wardCode: '001',
      wardName: 'Ward',
    });
    const bank = await db.getRepository(ShopBankAccount).save({
      shopId: f.shop.id,
      bankCode: 'TEST',
      accountNumber: '123456789',
      accountName: 'Allowed alternate recipient',
      confirmedBy: f.owner.id,
      confirmedAt: new Date(),
      isDefault: true,
    });
    const app = await service.create(f.owner.id, f.shop.id);
    const docs = [];
    for (const slot of ['FRONT', 'BACK'] as const) {
      const ticket = await uploads.createUploadTicket(f.owner.id, {
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        visibility: 'private',
      });
      const upload = await service.attach(f.owner.id, app.id, {
        slot,
        mediaId: ticket.mediaId,
      });
      docs.push(upload.id);
    }
    const input = {
      identity: {
        documentType: 'NATIONAL_ID' as const,
        documentNumber: randomUUID()
          .replaceAll('-', '')
          .slice(0, 12)
          .replace(/[a-f]/g, '1'),
        fullName: 'Applicant Owner',
        birthDate: '2000-01-02',
        expiresOn: '2099-01-01',
      },
      bankAccountId: bank.id,
      documentIds: docs,
    };
    return { ...f, app, bank, logo, input };
  }

  it('reviews current shop/identity info, activates on approval, and hides admin notes from applicant', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const submitted = await service.submit(f.owner.id, f.app.id, f.input);
    expect(submitted.state).toBe('SUBMITTED');
    expect(submitted.shop.name).toBe(f.shop.name);
    expect(submitted.bank?.id).toBe(f.bank.id);
    await expect(service.detail(f.buyer.id, f.app.id)).rejects.toThrow(
      /not found|Could not find/i,
    );
    await expect(
      service.download(f.buyer.id, f.input.documentIds[0]),
    ).rejects.toThrow('not found');

    const approved = await service.decide(f.admin.id, f.app.id, {
      outcome: 'APPROVED',
      reason: 'Original identity and supporting documents checked',
      adminNote: 'PRIVATE INTERNAL CHECK',
    });
    expect(approved.state).toBe('APPROVED');

    const shop = await db
      .getRepository(Shop)
      .findOneByOrFail({ id: f.shop.id });
    expect(shop.status).toBe(ShopStatus.ACTIVE);
    expect(shop.approvedAt).toBeInstanceOf(Date);
    expect(shop.identityExpiresOn).toBe('2099-01-01');
    expect(
      (
        await db
          .getRepository(ShopBankAccount)
          .findOneByOrFail({ id: f.bank.id })
      ).accountNumber,
    ).toBe('123456789');
    expect(
      JSON.stringify(await service.detail(f.owner.id, f.app.id)),
    ).not.toContain('PRIVATE INTERNAL CHECK');
  });

  it('blocks shop edits while pending review, allows edits on supplement/reject, and retires replaced logos', async () => {
    const f = await fixture();
    const db = database.dataSource;
    await service.submit(f.owner.id, f.app.id, f.input);

    await expect(
      shops.update(f.shop.id, f.owner.id, { name: 'Blocked while pending' }),
    ).rejects.toThrow('pending review');

    await service.decide(f.admin.id, f.app.id, {
      outcome: 'NEEDS_INFO',
      reason: 'Update shop name and logo clarity',
    });

    const newLogoTicket = await uploads.createUploadTicket(f.owner.id, {
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      visibility: 'public',
    });
    await shops.update(f.shop.id, f.owner.id, {
      name: 'Updated Supplement Shop',
      logoMediaId: newLogoTicket.mediaId,
    });

    const oldLogo = await db
      .getRepository(Media)
      .findOneByOrFail({ id: f.logo.id });
    expect(oldLogo.isAttached).toBe(false);
    expect(oldLogo.retiredAt).toBeInstanceOf(Date);

    const resubmitted = await service.submit(f.owner.id, f.app.id, f.input);
    expect(resubmitted.state).toBe('SUBMITTED');
    expect(resubmitted.shop.name).toBe('Updated Supplement Shop');
  });

  it('keeps a newly created Shop private and prevents status and draft-product approval bypass', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const pending = await shops.create(f.buyer.id, {
      name: 'New applicant Shop',
    });
    expect(pending.status).toBe(ShopStatus.PENDING);
    expect(pending.approvedAt).toBeNull();
    await expect(shops.findOne(pending.id)).rejects.toThrow('Could not find');
    await expect(
      shops.update(pending.id, f.buyer.id, { status: ShopStatus.ACTIVE }),
    ).rejects.toThrow('approval is required');
    await expect(
      shops.update(pending.id, f.buyer.id, { status: ShopStatus.INACTIVE }),
    ).rejects.toThrow('approval is required');

    const products = new ProductService(
      db.getRepository(Product),
      db.getRepository(Category),
      db.getRepository(Shop),
      db.getRepository(ShopMember),
      db,
      new AuthorizationService(db),
      storage as never,
      new OutboxService(),
    );
    await expect(
      products.create(f.buyer.id, { shopId: pending.id }),
    ).rejects.toThrow('Shop is not active');
  });

  it('accepts only passport slot for passport applications, enforces age/expiry, and hides unsubmitted/retired uploads from Admin', async () => {
    const f = await fixture();
    const other = await fixture();
    const db = database.dataSource;

    expect(
      (await service.detail(f.admin.id, f.app.id, true)).documents,
    ).toEqual([]);
    await expect(
      service.download(f.admin.id, f.input.documentIds[0], true),
    ).rejects.toThrow('not found');
    await expect(
      service.submit(f.owner.id, f.app.id, {
        ...f.input,
        documentIds: other.input.documentIds,
      }),
    ).rejects.toThrow('documents are missing');
    expect(
      (
        await db
          .getRepository(ShopApplicationDocument)
          .findOneByOrFail({ id: f.input.documentIds[0] })
      ).isSelected,
    ).toBe(false);

    await expect(
      service.submit(f.owner.id, f.app.id, {
        ...f.input,
        identity: { ...f.input.identity, birthDate: '2020-01-01' },
      }),
    ).rejects.toThrow('18');
    await expect(
      service.submit(f.owner.id, f.app.id, {
        ...f.input,
        identity: { ...f.input.identity, expiresOn: '2001-01-01' },
      }),
    ).rejects.toThrow('expired');
    await expect(
      service.submit(f.owner.id, f.app.id, {
        ...f.input,
        documentIds: [f.input.documentIds[0]],
      }),
    ).rejects.toThrow('documents are missing');

    const ticket = await uploads.createUploadTicket(f.owner.id, {
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      visibility: 'private',
    });
    const upload = await service.attach(f.owner.id, f.app.id, {
      slot: 'PASSPORT',
      mediaId: ticket.mediaId,
    });
    const submitted = await service.submit(f.owner.id, f.app.id, {
      ...f.input,
      identity: {
        ...f.input.identity,
        documentType: 'PASSPORT',
        documentNumber: 'P12345678',
      },
      documentIds: [upload.id],
    });
    expect(submitted.documents.filter((d) => d.isSelected)).toHaveLength(1);
    const adminView = await service.detail(f.admin.id, f.app.id, true);
    expect(adminView.documents.map((d) => d.id)).toEqual([upload.id]);
    await expect(
      service.download(f.admin.id, f.input.documentIds[0], true),
    ).rejects.toThrow('not found');
    await expect(
      service.download(f.admin.id, upload.id, true),
    ).resolves.toHaveProperty('url');
  });

  it('serializes duplicate identity approvals and leaves the losing Shop pending', async () => {
    const first = await fixture();
    const second = await fixture();
    const a = await service.submit(first.owner.id, first.app.id, first.input);
    const b = await service.submit(second.owner.id, second.app.id, {
      ...second.input,
      identity: {
        ...second.input.identity,
        documentNumber: first.input.identity.documentNumber,
      },
    });
    const decision = {
      outcome: 'APPROVED' as const,
      reason: 'Identity documents verified',
    };
    const results = await Promise.allSettled([
      service.decide(first.admin.id, a.id, decision),
      service.decide(second.admin.id, b.id, decision),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    const db = database.dataSource;
    const matchedShops = await db
      .getRepository(Shop)
      .findBy([{ id: first.shop.id }, { id: second.shop.id }]);
    expect(
      matchedShops.filter((s) => s.status === ShopStatus.ACTIVE),
    ).toHaveLength(1);
    expect(await db.getRepository(OwnerIdentity).count()).toBeGreaterThan(0);
  });
});
