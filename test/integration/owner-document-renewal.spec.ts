import { randomUUID } from 'node:crypto';

import { Media } from '@/modules/media/entities';
import { MediaType } from '@/modules/media/enums';
import { Notification } from '@/modules/notifications/entities';
import {
  ShopApplication,
  ShopApplicationDocument,
} from '@/modules/shop/applications/entities';
import { IdentityRenewalWorker } from '@/modules/shop/applications/renewal/identity-renewal.worker';
import { shopAllowsIdentitySales } from '@/modules/shop/applications/renewal/identity-sale.policy';
import { ShopApplicationService } from '@/modules/shop/applications/shop-application.service';
import { Shop } from '@/modules/shop/entities';

import { adjudicationFixture } from '../support/adjudication-fixture';
import { createTestDatabase } from '../support/database';
import { createPrivateMedia } from '../support/private-media';

describe('Owner document renewal (PostgreSQL)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let service: ShopApplicationService;

  beforeAll(async () => {
    database = await createTestDatabase();
    service = new ShopApplicationService(database.dataSource, {
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
        isSubmitted: false,
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

  it('persists one safe expiry notice across repeated worker scans', async () => {
    const f = await fixture();
    const db = database.dataSource;
    const worker = new IdentityRenewalWorker(db);

    await worker.run();
    const firstCount = await db
      .getRepository(Notification)
      .countBy({ recipientId: f.owner.id });
    expect(firstCount).toBeGreaterThan(0);

    await worker.run();
    expect(
      await db.getRepository(Notification).countBy({ recipientId: f.owner.id }),
    ).toBe(firstCount);
  });
});
