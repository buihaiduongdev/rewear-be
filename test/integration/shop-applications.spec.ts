import { randomUUID } from 'node:crypto';

import type { EntityManager } from 'typeorm';

import { PrivateEvidenceStorage } from '@/infrastructure/storage/private-evidence.storage';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { ShopRoleService } from '@/modules/authorization/shop-role.service';
import { Category } from '@/modules/category/entities';
import { Product } from '@/modules/product/entities';
import { ProductService } from '@/modules/product/product.service';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { ShopBankAccount } from '@/modules/shop-finance/payouts/entities/shop-bank-account.entity';
import {
  OwnerIdentityDocument,
  ShopApplication,
  ShopApplicationDocument,
} from '@/modules/shop/applications/entities/shop-application.entity';
import { ShopApplicationMediaService } from '@/modules/shop/applications/media/shop-application-media.service';
import { ShopApplicationAdminService } from '@/modules/shop/applications/shop-application-admin.service';
import { ShopApplicationReadService } from '@/modules/shop/applications/shop-application-read.service';
import { ShopApplicationAccess } from '@/modules/shop/applications/shop-application.access';
import { ShopApplicationService } from '@/modules/shop/applications/shop-application.service';
import { Shop } from '@/modules/shop/entities';
import { ShopMember } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';
import { ShopService } from '@/modules/shop/shop.service';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';

describe('Shop Owner application (PostgreSQL)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let service: ShopApplicationService;
  let admin: ShopApplicationAdminService;
  let media: ShopApplicationMediaService;
  const storage = {
    assertConfigured: jest.fn(),
    createUploadTicket: jest.fn(async () => ({
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
    const access = new ShopApplicationAccess();
    const read = new ShopApplicationReadService(db, access);
    service = new ShopApplicationService(db, access, read);
    admin = new ShopApplicationAdminService(db, access, read);
    media = new ShopApplicationMediaService(
      db,
      access,
      storage as unknown as PrivateEvidenceStorage,
    );
  });
  afterAll(async () => database?.destroy());
  async function fixture() {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    await db.getRepository(Shop).update(
      { id: f.shop.id },
      {
        status: ShopStatus.PENDING,
        onboardingRequired: true,
        logoUrl: 'https://public.test/logo.jpg',
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
    const app = await service.create(f.owner.id, f.shop.id, {
      requestId: randomUUID(),
    });
    const docs = [];
    for (const slot of ['FRONT', 'BACK'] as const) {
      const upload = await media.createUpload(f.owner.id, app.id, {
        slot,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      });
      await media.complete(f.owner.id, upload.id);
      docs.push(upload.id);
    }
    const input = {
      requestId: randomUUID(),
      expectedVersion: app.version,
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
    return { ...f, app, bank, input };
  }
  it('freezes private documents and activates only after a versioned Admin approval', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const submitted = await service.submit(f.owner.id, f.app.id, f.input);
    expect(submitted.state).toBe('SUBMITTED');
    expect((await service.submit(f.owner.id, f.app.id, f.input)).version).toBe(
      submitted.version,
    );
    await expect(service.find(f.buyer.id, f.app.id)).rejects.toThrow(
      'not found',
    );
    await expect(
      media.download(f.buyer.id, f.input.documentIds[0]),
    ).rejects.toThrow('not found');
    const approved = await admin.decide(f.admin.id, f.app.id, {
      requestId: randomUUID(),
      expectedVersion: submitted.version,
      outcome: 'APPROVED',
      reason: 'Original identity and supporting documents checked',
      identityCheckEvidence:
        'Manual identity and cross-document account search completed',
      identityMatchesApplicant: true,
      noOtherApprovedAccount: true,
    });
    expect(approved.state).toBe('APPROVED');
    const shop = await db
      .getRepository(Shop)
      .findOneByOrFail({ id: f.shop.id });
    expect(shop.status).toBe(ShopStatus.ACTIVE);
    expect(shop.approvedAt).toBeInstanceOf(Date);
    expect(
      (
        await db
          .getRepository(ShopBankAccount)
          .findOneByOrFail({ id: f.bank.id })
      ).verificationStatus,
    ).toBe('UNVERIFIED');
  });
  it('requires supplemental resubmission and refuses approval of changed bank/profile snapshots', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const submitted = await service.submit(f.owner.id, f.app.id, f.input);
    await db
      .getRepository(ShopBankAccount)
      .update({ id: f.bank.id }, { accountName: 'Changed after submission' });
    await expect(
      admin.decide(f.admin.id, f.app.id, {
        requestId: randomUUID(),
        expectedVersion: submitted.version,
        outcome: 'APPROVED',
        reason: 'Reviewed documents',
        identityCheckEvidence: 'Verified identity',
        identityMatchesApplicant: true,
        noOtherApprovedAccount: true,
      }),
    ).rejects.toThrow('snapshot changed');
    const requested = await admin.decide(f.admin.id, f.app.id, {
      requestId: randomUUID(),
      expectedVersion: submitted.version,
      outcome: 'NEEDS_INFO',
      reason: 'Confirm the changed bank recipient before resubmission',
    });
    const resubmitted = await service.submit(f.owner.id, f.app.id, {
      ...f.input,
      requestId: randomUUID(),
      expectedVersion: requested.version,
    });
    expect(resubmitted.revision).toBe(2);
  });
  it('keeps a newly created Shop private and prevents status and draft-product approval bypass', async () => {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const shops = new ShopService(
      db.getRepository(Shop),
      db.getRepository(ShopMember),
      db,
      new ShopRoleService(db),
    );
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
    );
    await expect(
      products.create(f.buyer.id, { shopId: pending.id }),
    ).rejects.toThrow('Shop is not active');
  });
  it('accepts only the passport page for passport applications and enforces age/expiry', async () => {
    const f = await fixture();
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
    const upload = await media.createUpload(f.owner.id, f.app.id, {
      slot: 'PASSPORT',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    });
    await media.complete(f.owner.id, upload.id);
    const submitted = await service.submit(f.owner.id, f.app.id, {
      ...f.input,
      identity: {
        ...f.input.identity,
        documentType: 'PASSPORT',
        documentNumber: 'P12345678',
      },
      documentIds: [upload.id],
    });
    expect(submitted.snapshot!.documents).toHaveLength(1);
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
      identityCheckEvidence: 'Cross-document duplicate account check performed',
      identityMatchesApplicant: true as const,
      noOtherApprovedAccount: true as const,
    };
    const results = await Promise.allSettled([
      admin.decide(first.admin.id, a.id, {
        ...decision,
        requestId: randomUUID(),
        expectedVersion: a.version,
      }),
      admin.decide(second.admin.id, b.id, {
        ...decision,
        requestId: randomUUID(),
        expectedVersion: b.version,
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const db = database.dataSource;
    const shops = await db
      .getRepository(Shop)
      .findBy([{ id: first.shop.id }, { id: second.shop.id }]);
    expect(shops.filter((s) => s.status === ShopStatus.ACTIVE)).toHaveLength(1);
    expect(
      await db.getRepository(OwnerIdentityDocument).count(),
    ).toBeGreaterThan(0);
  });
  it('revalidates role on replay and does not reactivate a Shop after a later restriction', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const submitted = await service.submit(f.owner.id, f.app.id, f.input);
    const decision = {
      requestId: randomUUID(),
      expectedVersion: submitted.version,
      outcome: 'APPROVED' as const,
      reason: 'Identity verified manually',
      identityCheckEvidence:
        'Original documents and account uniqueness reviewed',
      identityMatchesApplicant: true as const,
      noOtherApprovedAccount: true as const,
      adminNote: 'PRIVATE INTERNAL CHECK',
    };
    await admin.decide(f.admin.id, f.app.id, decision);
    await db
      .getRepository(Shop)
      .update({ id: f.shop.id }, { status: ShopStatus.INACTIVE });
    await admin.decide(f.admin.id, f.app.id, decision);
    expect(
      (await db.getRepository(Shop).findOneByOrFail({ id: f.shop.id })).status,
    ).toBe(ShopStatus.INACTIVE);
    expect(
      JSON.stringify(await service.find(f.owner.id, f.app.id)),
    ).not.toContain('PRIVATE INTERNAL CHECK');
    await db
      .getRepository(User)
      .update({ id: f.admin.id }, { role: UserRole.USER });
    await expect(admin.decide(f.admin.id, f.app.id, decision)).rejects.toThrow(
      'Admin required',
    );
  });
  it('protects draft evidence and refuses cross-application and mutated uploads without partial submission', async () => {
    const f = await fixture();
    const other = await fixture();
    const db = database.dataSource;
    await expect(
      media.download(f.admin.id, f.input.documentIds[0]),
    ).rejects.toThrow('not found');
    await expect(
      service.submit(f.owner.id, f.app.id, {
        ...f.input,
        documentIds: other.input.documentIds,
      }),
    ).rejects.toThrow('documents are missing');
    storage.getObjectMetadata.mockResolvedValueOnce({
      eTag: 'changed',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    });
    await expect(
      media.complete(f.owner.id, f.input.documentIds[0]),
    ).rejects.toThrow('immutable');
    expect(
      (
        await db
          .getRepository(ShopApplication)
          .findOneByOrFail({ id: f.app.id })
      ).revision,
    ).toBe(0);
    expect(
      (
        await db
          .getRepository(ShopApplicationDocument)
          .findOneByOrFail({ id: f.input.documentIds[0] })
      ).firstSubmittedRevision,
    ).toBeNull();
    await service.submit(f.owner.id, f.app.id, f.input);
    await expect(
      media.download(f.admin.id, f.input.documentIds[0]),
    ).resolves.toHaveProperty('url');
  });
  it('serializes account revocation with an in-flight Admin approval', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const submitted = await service.submit(f.owner.id, f.app.id, f.input);
    let resume!: () => void;
    let observed!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      observed = resolve;
    });
    class GatedAccess extends ShopApplicationAccess {
      async active(manager: EntityManager, userId: string, isAdmin = false) {
        const user = await super.active(manager, userId, isAdmin);
        if (userId === f.admin.id && isAdmin) {
          observed();
          await gate;
        }
        return user;
      }
    }
    const access = new GatedAccess();
    const read = new ShopApplicationReadService(db, access);
    const review = new ShopApplicationAdminService(db, access, read);
    const pending = review.decide(f.admin.id, f.app.id, {
      requestId: randomUUID(),
      expectedVersion: submitted.version,
      outcome: 'APPROVED',
      reason: 'Identity checked with account lock',
      identityCheckEvidence:
        'Manual identity and cross-account verification completed',
      identityMatchesApplicant: true,
      noOtherApprovedAccount: true,
    });
    await reached;
    try {
      await expect(
        db.transaction(async (manager) => {
          await manager.query("SET LOCAL lock_timeout='100ms'");
          await manager.update(
            User,
            { id: f.admin.id },
            { role: UserRole.USER },
          );
        }),
      ).rejects.toThrow('lock timeout');
    } finally {
      resume();
      await pending;
    }
  });
});
