import { ConflictException } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { Shop } from '../../entities';
import { ShopStatus } from '../../enums';
import { ShopApplication } from '../entities/shop-application.entity';
import { claimVerifiedOwnerDocument } from './identity-document-claim.policy';
import {
  applicationFingerprint,
  buildApplicationSnapshot,
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
  if (!row.snapshot.bank || !row.snapshot.pickup)
    throw new ConflictException('Initial onboarding context is required');
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
  await claimVerifiedOwnerDocument(manager, row);
  shop.status = ShopStatus.ACTIVE;
  shop.approvedAt = now;
  shop.identityExpiresOn = current.identity.expiresOn;
  shop.identityDocumentVersion = 1;
  shop.identityNextCheckAt = now;
  await manager.save(shop);
}
