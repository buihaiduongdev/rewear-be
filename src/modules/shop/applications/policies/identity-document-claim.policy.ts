import { ConflictException } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import {
  OwnerIdentity,
  OwnerIdentityDocument,
  ShopApplication,
} from '../entities';
import {
  identityFingerprint,
  normalizeIdentityName,
} from './shop-application.policy';

export async function claimVerifiedOwnerDocument(
  manager: EntityManager,
  row: ShopApplication,
) {
  if (!row.snapshot)
    throw new ConflictException('Submitted identity is required');
  const document = row.snapshot.identity;
  const fingerprint = identityFingerprint(document);
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
  identity ??= manager.create(OwnerIdentity, {
    ownerId: row.applicantId,
    applicationId: row.id,
  });
  identity.normalizedName = normalizeIdentityName(document.fullName);
  identity.birthDate = document.birthDate;
  await manager.save(identity);
  if (!claim)
    await manager.save(
      OwnerIdentityDocument,
      manager.create(OwnerIdentityDocument, {
        identityId: identity.id,
        fingerprint,
        document,
      }),
    );
}
