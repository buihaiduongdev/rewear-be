import { randomUUID } from 'node:crypto';

import { Media } from '@/modules/media/entities';
import { MediaType } from '@/modules/media/enums';
import { Notification } from '@/modules/notifications/entities/notification.entity';
import {
  ShopApplication,
  ShopApplicationDocument,
} from '@/modules/shop/applications/entities/shop-application.entity';
import { IdentityRenewalWorker } from '@/modules/shop/applications/renewal/identity-renewal.worker';
import { shopAllowsIdentitySales } from '@/modules/shop/applications/renewal/identity-sale.policy';
import { OwnerIdentityRenewalService } from '@/modules/shop/applications/renewal/owner-identity-renewal.service';
import { ShopApplicationAdminService } from '@/modules/shop/applications/shop-application-admin.service';
import { ShopApplicationReadService } from '@/modules/shop/applications/shop-application-read.service';
import { ShopApplicationAccess } from '@/modules/shop/applications/shop-application.access';
import { Shop } from '@/modules/shop/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';
import { createPrivateMedia } from '../support/private-media';

describe('Owner document renewal (PostgreSQL)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let renewals: OwnerIdentityRenewalService;
  let admins: ShopApplicationAdminService;
  beforeAll(async () => {
    database = await createTestDatabase();
    const db = database.dataSource;
    const access = new ShopApplicationAccess();
    const read = new ShopApplicationReadService(db, access);
    renewals = new OwnerIdentityRenewalService(db, access, read, {
      getPublicUrl: (key: string) => `https://public.test/${key}`,
    } as never);
    admins = new ShopApplicationAdminService(db, access, read, {
      getPublicUrl: (key: string) => `https://public.test/${key}`,
    } as never);
  });
  afterAll(async () => database?.destroy());
  async function fixture(expiresOn = '2020-01-01') {
    const db = database.dataSource;
    const f = await adjudicationFixture(db);
    const identity = {
      documentType: 'NATIONAL_ID' as const,
      documentNumber: randomUUID()
        .replaceAll('-', '')
        .slice(0, 12)
        .replace(/[a-f]/g, '1'),
      issuingCountry: 'VN',
      fullName: 'Renewal Owner',
      birthDate: '1980-01-01',
      expiresOn,
    };
    const logo = await db
      .getRepository(Media)
      .save({
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
        onboardingRequired: true,
        approvedAt: new Date(),
        logoMediaId: logo.id,
        identityExpiresOn: expiresOn,
        identityDocumentVersion: 1,
      },
    );
    await db.getRepository(ShopApplication).save({
      shopId: f.shop.id,
      applicantId: f.owner.id,
      kind: 'INITIAL',
      state: 'APPROVED',
      snapshot: {
        identity,
        shop: {
          id: f.shop.id,
          name: f.shop.name,
          description: null,
          logoUrl: 'https://public.test/logo.jpg',
        },
        pickup: null,
        bank: null,
        documents: [],
      },
      version: 1,
      revision: 1,
    });
    const cycle = await renewals.create(f.owner.id, f.shop.id, {
      requestId: randomUUID(),
    });
    const ids = [];
    for (const slot of ['FRONT', 'BACK'] as const) {
      const file = await createPrivateMedia(db, f.owner.id);
      const doc = await db.getRepository(ShopApplicationDocument).save({
        applicationId: cycle.id,
        uploadedById: f.owner.id,
        slot,
        mediaId: file.id,
        firstSubmittedRevision: null,
      });
      ids.push(doc.id);
    }
    return {
      ...f,
      cycle,
      input: {
        requestId: randomUUID(),
        expectedVersion: cycle.version,
        identity: { ...identity, expiresOn: '2099-01-01' },
        documentIds: ids,
      },
    };
  }
  it('does not reopen sales for late submission, starts only one7-day correction clock, and protects timely supplementation', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const submitted = await renewals.submit(f.owner.id, f.cycle.id, f.input);
    expect(
      shopAllowsIdentitySales(
        await db.getRepository(Shop).findOneByOrFail({ id: f.shop.id }),
      ),
    ).toBe(false);
    const request = {
      requestId: randomUUID(),
      expectedVersion: submitted.version,
      outcome: 'NEEDS_INFO' as const,
      reasonCategory: 'IMAGE_QUALITY' as const,
      reason: 'Image is blurred; submit clear front and back',
    };
    const requested = await admins.decide(f.admin.id, f.cycle.id, request);
    const deadline = requested.correctionDueAt;
    expect(deadline).toBeInstanceOf(Date);
    const resubmitted = await renewals.submit(f.owner.id, f.cycle.id, {
      ...f.input,
      requestId: randomUUID(),
      expectedVersion: requested.version,
    });
    expect(
      shopAllowsIdentitySales(
        await db.getRepository(Shop).findOneByOrFail({ id: f.shop.id }),
      ),
    ).toBe(true);
    const again = await admins.decide(f.admin.id, f.cycle.id, {
      ...request,
      requestId: randomUUID(),
      expectedVersion: resubmitted.version,
    });
    expect(again.correctionDueAt?.getTime()).toBe(deadline?.getTime());
  });
  it('approval clears only identity restrictions and does not reactivate an inactive Shop', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const submitted = await renewals.submit(f.owner.id, f.cycle.id, f.input);
    await db
      .getRepository(Shop)
      .update(
        { id: f.shop.id },
        { status: 'INACTIVE' as never, identityManualRestriction: true },
      );
    const decision = {
      requestId: randomUUID(),
      expectedVersion: submitted.version,
      outcome: 'APPROVED' as const,
      reason: 'New document manually verified',
      identityCheckEvidence: 'Same person and document uniqueness verified',
      identityMatchesApplicant: true as const,
      noOtherApprovedAccount: true as const,
      samePersonConfirmed: true as const,
    };
    await admins.decide(f.admin.id, f.cycle.id, decision);
    await admins.decide(f.admin.id, f.cycle.id, decision);
    const shop = await db
      .getRepository(Shop)
      .findOneByOrFail({ id: f.shop.id });
    expect(shop.status).toBe('INACTIVE');
    expect(shop.identityExpiresOn).toBe('2099-01-01');
    expect(shop.identityDocumentVersion).toBe(2);
    expect(shop.identityManualRestriction).toBe(false);
  });
  it('keeps a timely complete submission operating past grace until a decision', async () => {
    const expiresOn = new Date().toISOString().slice(0, 10);
    const f = await fixture(expiresOn);
    const db = database.dataSource;
    await renewals.submit(f.owner.id, f.cycle.id, f.input);
    const shop = await db
      .getRepository(Shop)
      .findOneByOrFail({ id: f.shop.id });
    expect(shop.identityReviewProtected).toBe(true);
    expect(shopAllowsIdentitySales(shop, new Date('2098-01-01'))).toBe(true);
  });
  it('does not reset the first correction deadline and restricts an unsuitable late review', async () => {
    const f = await fixture();
    const db = database.dataSource;
    let submitted = await renewals.submit(f.owner.id, f.cycle.id, f.input);
    const first = new Date(Date.now() - 8 * 86400000);
    const due = new Date(Date.now() - 86400000);
    await db
      .getRepository(ShopApplication)
      .update(f.cycle.id, { firstCorrectionAt: first, correctionDueAt: due });
    await db
      .getRepository(Shop)
      .update(f.shop.id, { identityReviewProtected: true });
    const result = await admins.decide(f.admin.id, f.cycle.id, {
      requestId: randomUUID(),
      expectedVersion: submitted.version,
      outcome: 'NEEDS_INFO',
      reasonCategory: 'IMAGE_QUALITY',
      reason: 'Front image remains illegible',
    });
    expect(result.correctionDueAt).toEqual(due);
    let shop = await db.getRepository(Shop).findOneByOrFail({ id: f.shop.id });
    expect(shop.identityManualRestriction).toBe(true);
    expect(shopAllowsIdentitySales(shop)).toBe(false);
    submitted = await renewals.submit(f.owner.id, f.cycle.id, {
      ...f.input,
      requestId: randomUUID(),
      expectedVersion: result.version,
    });
    shop = await db.getRepository(Shop).findOneByOrFail({ id: f.shop.id });
    expect(shop.identityReviewProtected).toBe(false);
    expect(submitted.state).toBe('SUBMITTED');
  });
  it('requires a same-person decision and current document version', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const submitted = await renewals.submit(f.owner.id, f.cycle.id, f.input);
    const decision = {
      requestId: randomUUID(),
      expectedVersion: submitted.version,
      outcome: 'APPROVED' as const,
      reason: 'Verified new identity document',
      identityCheckEvidence: 'Manual identity review complete',
      identityMatchesApplicant: true as const,
      noOtherApprovedAccount: true as const,
    };
    await expect(
      admins.decide(f.admin.id, f.cycle.id, decision),
    ).rejects.toThrow('same-person');
    await db
      .getRepository(Shop)
      .update(f.shop.id, { identityDocumentVersion: 2 });
    await expect(
      admins.decide(f.admin.id, f.cycle.id, {
        ...decision,
        samePersonConfirmed: true,
      }),
    ).rejects.toThrow('changed');
  });
  it('persists one safe expiry notice across repeated worker scans', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const worker = new IdentityRenewalWorker(db);
    await worker.run();
    const first = await db
      .getRepository(Notification)
      .countBy({ recipientId: f.owner.id });
    await db
      .getRepository(Shop)
      .update(f.shop.id, { identityNextCheckAt: null });
    await worker.run();
    expect(
      await db.getRepository(Notification).countBy({ recipientId: f.owner.id }),
    ).toBe(first);
    const shop = await db
      .getRepository(Shop)
      .findOneByOrFail({ id: f.shop.id });
    expect(shop.identityObservedRestricted).toBe(true);
    expect(shop.identityExpiryNotifiedVersion).toBe(1);
  });
});
