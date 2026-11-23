import { ConflictException } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { Shop } from '../../entities';
import { ShopStatus } from '../../enums';
import {
  OwnerIdentity,
  OwnerIdentityDocument,
  ShopApplication,
} from '../entities/shop-application.entity';
import {
  applicationFingerprint,
  buildApplicationSnapshot,
  identityFingerprint,
  normalizeIdentityName,
  validateApplicantIdentity,
} from './shop-application.policy';

/** Caller holds current Admin/Owner checks and the commerce transaction lock. */
export async function approveShopApplication(
  manager: EntityManager,
  row: ShopApplication,
  shop: Shop,
  now: Date,
) {
  if (!row.snapshot)
    throw new ConflictException('Submitted identity snapshot is required');
  validateApplicantIdentity(row.snapshot.identity, now);
  const current = await buildApplicationSnapshot(
    manager,
    row,
    row.snapshot.identity,
    row.snapshot.bank.id,
    row.snapshot.documents.map((d) => d.id),
  );
  const snapshotChanged =
    applicationFingerprint(current) !== row.snapshotFingerprint;
  if (snapshotChanged)
    throw new ConflictException(
      'Application profile/bank/pickup snapshot changed',
    );
  const fingerprint = identityFingerprint(current.identity);
  const claim = await manager.findOne(OwnerIdentityDocument, {
    where: { fingerprint },
    relations: { identity: true },
  });
  if (claim && claim.identity.ownerId !== row.applicantId)
    throw new ConflictException(
      'Identity document already belongs to an approved account',
    );
  let identity = await manager.findOneBy(OwnerIdentity, {
    ownerId: row.applicantId,
  });
  identity ??= await manager.save(
    OwnerIdentity,
    manager.create(OwnerIdentity, {
      ownerId: row.applicantId,
      applicationId: row.id,
      normalizedName: normalizeIdentityName(current.identity.fullName),
      birthDate: current.identity.birthDate,
    }),
  );
  if (!claim)
    await manager.save(
      OwnerIdentityDocument,
      manager.create(OwnerIdentityDocument, {
        identityId: identity.id,
        fingerprint,
        document: current.identity,
      }),
    );
  shop.status = ShopStatus.ACTIVE;
  shop.approvedAt = now;
  await manager.save(shop);
}
