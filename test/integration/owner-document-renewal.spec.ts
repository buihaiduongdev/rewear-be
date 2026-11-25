import { randomUUID } from 'node:crypto';

import { AuthProvider } from '@/modules/auth/enums';
import { Media } from '@/modules/media/entities';
import { MediaType } from '@/modules/media/enums';
import { Notification } from '@/modules/notifications/entities';
import { IDENTITY_RENEWAL_POLICY } from '@/modules/shop/applications/constants/shop-application.constant';
import {
  ShopApplication,
  ShopApplicationDocument,
} from '@/modules/shop/applications/entities';
import { IdentityRenewalWorker } from '@/modules/shop/applications/renewal/identity-renewal.worker';
import { shopAllowsIdentitySales } from '@/modules/shop/applications/renewal/identity-sale.policy';
import { ShopApplicationService } from '@/modules/shop/applications/shop-application.service';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';
import { createPrivateMedia } from '../support/private-media';

describe('Owner document renewal (PostgreSQL)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let service: ShopApplicationService;

  beforeAll(async () => {
    database = await createTestDatabase();
    service = new ShopApplicationService(
      database.dataSource,
      { getPublicUrl: (key: string) => `https://public.test/${key}` } as never,
      {} as never,
    );
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
        onboardingRequired: true,
        approvedAt: new Date(),
        logoMediaId: logo.id,
        identityExpiresOn: expiresOn,
      },
    );
    await db.getRepository(ShopApplication).save({
      shopId: f.shop.id,
      applicantId: f.owner.id,
      kind: 'INITIAL',
      state: 'APPROVED',
      ...identity,
    });
    const cycle = await service.createRenewal(f.owner.id, f.shop.id);
    const ids = [];
    for (const slot of ['FRONT', 'BACK'] as const) {
      const file = await createPrivateMedia(db, f.owner.id);
      const doc = await db.getRepository(ShopApplicationDocument).save({
        applicationId: cycle.id,
        uploadedById: f.owner.id,
        slot,
        mediaId: file.id,
        isSelected: false,
      });
      ids.push(doc.id);
    }
    return {
      ...f,
      cycle,
      input: {
        identity: { ...identity, expiresOn: '2099-01-01' },
        documentIds: ids,
      },
    };
  }

  it('supports supplement resubmission and clears only identity restrictions on approval without reactivating an inactive Shop', async () => {
    const f = await fixture();
    const db = database.dataSource;

    const submitted = await service.submitRenewal(
      f.owner.id,
      f.cycle.id,
      f.input,
    );
    expect(submitted.state).toBe('SUBMITTED');
    expect(
      shopAllowsIdentitySales(
        await db.getRepository(Shop).findOneByOrFail({ id: f.shop.id }),
      ),
    ).toBe(false);

    const requested = await service.decide(f.admin.id, f.cycle.id, {
      outcome: 'NEEDS_INFO',
      reason: 'Image is blurred; submit clear front and back',
    });
    expect(requested.state).toBe('NEEDS_INFO');

    await service.submitRenewal(f.owner.id, f.cycle.id, f.input);
    await db
      .getRepository(Shop)
      .update(
        { id: f.shop.id },
        { status: 'INACTIVE' as never, identityManualRestriction: true },
      );

    await service.decide(f.admin.id, f.cycle.id, {
      outcome: 'APPROVED',
      reason: 'New document manually verified',
    });

    const shop = await db
      .getRepository(Shop)
      .findOneByOrFail({ id: f.shop.id });
    expect(shop.status).toBe('INACTIVE');
    expect(shop.identityExpiresOn).toBe('2099-01-01');
    expect(shop.identityManualRestriction).toBe(false);
    expect(shopAllowsIdentitySales(shop)).toBe(true);
  });

  it('persists one safe expiry notice per stage and advances past already-notified batches without starvation', async () => {
    const db = database.dataSource;
    const worker = new IdentityRenewalWorker(db);
    const total = IDENTITY_RENEWAL_POLICY.BATCH_SIZE + 2;
    const owners: User[] = [];

    for (let i = 0; i < total; i++) {
      const owner = await db.getRepository(User).save({
        email: `renewal-batch-${i}-${randomUUID()}@test.local`,
        password: null,
        fullName: `Batch Owner ${i}`,
        provider: AuthProvider.GOOGLE,
        providerAccountId: randomUUID(),
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      });
      owners.push(owner);
      const expiresOn =
        i < IDENTITY_RENEWAL_POLICY.BATCH_SIZE ? '2020-01-01' : '2026-10-15';
      const shop = await db.getRepository(Shop).save({
        name: `Batch Shop ${i}`,
        onboardingRequired: true,
        approvedAt: new Date('2020-01-01T00:00:00Z'),
        identityExpiresOn: expiresOn,
      });
      await db.getRepository(ShopApplication).save({
        shopId: shop.id,
        applicantId: owner.id,
        kind: 'INITIAL',
        state: 'APPROVED',
        documentType: 'NATIONAL_ID',
        documentNumber: String(100000000000 + i),
        issuingCountry: 'VN',
        fullName: owner.fullName,
        birthDate: '1990-01-01',
        expiresOn,
      });
    }

    const scanTime = new Date('2026-10-20T00:00:00Z');
    await worker.run(scanTime);
    const tailOwner = owners[total - 1];
    expect(
      await db
        .getRepository(Notification)
        .countBy({ recipientId: tailOwner.id }),
    ).toBe(0);

    await worker.run(scanTime);
    const graceNotice = await db
      .getRepository(Notification)
      .findOneByOrFail({ recipientId: tailOwner.id });
    expect(graceNotice.title).toContain('ân hạn');

    await worker.run(scanTime);
    expect(
      await db
        .getRepository(Notification)
        .countBy({ recipientId: tailOwner.id }),
    ).toBe(1);

    await worker.run(new Date('2026-11-20T00:00:00Z'));
    expect(
      await db
        .getRepository(Notification)
        .countBy({ recipientId: tailOwner.id }),
    ).toBe(2);
  });
});
