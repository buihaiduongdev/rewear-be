import { BadRequestException, ConflictException } from '@nestjs/common';

import type { EntityManager } from 'typeorm';
import z from 'zod';

import type { Shop } from '../../entities';
import {
  IDENTITY_RENEWAL_POLICY,
  IDENTITY_RENEWAL_REASON,
  SHOP_APPLICATION_STATE,
} from '../constants/shop-application.constant';
import type { ShopApplication } from '../entities/shop-application.entity';
import { claimVerifiedOwnerDocument } from '../policies/identity-document-claim.policy';
import { validateApplicantIdentity } from '../policies/shop-application.policy';
import { applicationDecisionSchema } from '../schemas/shop-application.schema';
import { identityGraceDeadline } from './identity-sale.policy';
import { renewalDocuments } from './renewal-documents.policy';

export async function decideOwnerRenewal(
  manager: EntityManager,
  row: ShopApplication,
  shop: Shop,
  data: z.output<typeof applicationDecisionSchema>,
  now: Date,
) {
  const identityChanged =
    !row.snapshot ||
    row.baseIdentityVersion !== shop.identityDocumentVersion ||
    !shop.identityExpiresOn;
  if (identityChanged || !row.snapshot || !shop.identityExpiresOn)
    throw new ConflictException('Approved identity changed');
  if (data.outcome === SHOP_APPLICATION_STATE.APPROVED) {
    if (!data.samePersonConfirmed)
      throw new BadRequestException(
        'Renewal approval requires a same-person check',
      );
    validateApplicantIdentity(row.snapshot.identity, now);
    await renewalDocuments(
      manager,
      row,
      row.snapshot.identity,
      row.snapshot.documents.map((d) => d.id),
    );
    await claimVerifiedOwnerDocument(manager, row);
    shop.identityExpiresOn = row.snapshot.identity.expiresOn;
    shop.identityDocumentVersion = (shop.identityDocumentVersion ?? 0) + 1;
    shop.identityCorrectionUntil = null;
    shop.identityReviewProtected = false;
    shop.identityManualRestriction = false;
  } else {
    if (!data.reasonCategory)
      throw new BadRequestException('Renewal decision category is required');
    shop.identityReviewProtected = false;
    if (data.outcome === SHOP_APPLICATION_STATE.NEEDS_INFO) {
      if (data.reasonCategory !== IDENTITY_RENEWAL_REASON.IMAGE_QUALITY)
        throw new BadRequestException(
          'Only image-quality correction grants a supplement window',
        );
      row.firstCorrectionAt ??= now;
      row.correctionDueAt ??= new Date(
        row.firstCorrectionAt.getTime() + IDENTITY_RENEWAL_POLICY.CORRECTION_MS,
      );
      shop.identityCorrectionUntil = row.correctionDueAt;
      if (now >= row.correctionDueAt) shop.identityManualRestriction = true;
    } else if (
      now >= identityGraceDeadline(shop.identityExpiresOn) ||
      (row.correctionDueAt !== null && now >= row.correctionDueAt)
    )
      shop.identityManualRestriction = true;
  }
  shop.identityNextCheckAt = now;
  await manager.save(shop);
}
