import { BadRequestException } from '@nestjs/common';

import { EntityManager, In } from 'typeorm';

import {
  IDENTITY_DOCUMENT_SLOT,
  IDENTITY_DOCUMENT_TYPE,
} from '../constants/shop-application.constant';
import { ShopApplication, ShopApplicationDocument } from '../entities';
import type { ApplicantIdentity } from '../schemas/shop-application.schema';

export async function renewalDocuments(
  manager: EntityManager,
  row: ShopApplication,
  identity: ApplicantIdentity,
  ids: string[],
) {
  const docs = await manager.find(ShopApplicationDocument, {
    where: {
      id: In(ids),
      applicationId: row.id,
      uploadedById: row.applicantId,
    },
    order: { slot: 'ASC', id: 'ASC' },
  });
  const required =
    identity.documentType === IDENTITY_DOCUMENT_TYPE.NATIONAL_ID
      ? [IDENTITY_DOCUMENT_SLOT.FRONT, IDENTITY_DOCUMENT_SLOT.BACK]
      : [IDENTITY_DOCUMENT_SLOT.PASSPORT];
  const valid =
    docs.length === ids.length &&
    docs.length === required.length &&
    required.every(
      (slot) =>
        docs.filter((d) => d.slot === slot && !d.media.retiredAt).length === 1,
    );
  if (!valid)
    throw new BadRequestException(
      'Required owned renewal documents are missing',
    );
  return docs;
}
