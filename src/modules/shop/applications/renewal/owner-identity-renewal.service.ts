import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, Not } from 'typeorm';
import z from 'zod';

import { StorageService } from '@/infrastructure/storage';
import { Media } from '@/modules/media/entities';

import { Shop } from '../../entities';
import {
  SHOP_APPLICATION_ACTION,
  SHOP_APPLICATION_KIND,
  SHOP_APPLICATION_STATE,
} from '../constants/shop-application.constant';
import {
  ShopApplication,
  ShopApplicationRevision,
} from '../entities/shop-application.entity';
import {
  applicationFingerprint,
  editableApplication,
  pendingApplicationShop,
  validateApplicantIdentity,
} from '../policies/shop-application.policy';
import { ShopApplicationReadService } from '../shop-application-read.service';
import {
  applicationClock,
  applicationCommand,
  applicationReplay,
  ShopApplicationAccess,
} from '../shop-application.access';
import { applicationEvent } from '../shop-application.lifecycle';
import { identityGraceDeadline } from './identity-sale.policy';
import { renewalDocuments } from './renewal-documents.policy';
import {
  createIdentityRenewalSchema,
  submitIdentityRenewalSchema,
} from './renewal.schema';

@Injectable()
export class OwnerIdentityRenewalService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ShopApplicationAccess,
    private readonly read: ShopApplicationReadService,
    private readonly storage: StorageService,
  ) {}
  create(
    actorId: string,
    shopId: string,
    input: z.input<typeof createIdentityRenewalSchema>,
  ) {
    const data = createIdentityRenewalSchema.parse(input);
    const payload = {
      action: SHOP_APPLICATION_ACTION.RENEWAL_CREATED,
      shopId,
      data,
    };
    return this.db.transaction(async (manager) => {
      const now = await applicationClock(manager);
      await this.access.owner(manager, actorId, shopId);
      const command = await applicationReplay(
        manager,
        actorId,
        data.requestId,
        payload,
      );
      if (command)
        return this.read.view(
          manager,
          await this.access.own(manager, actorId, command.applicationId),
        );
      const shop = await manager.findOneByOrFail(Shop, { id: shopId });
      const original = await manager.findOneBy(ShopApplication, {
        shopId,
        applicantId: actorId,
        kind: SHOP_APPLICATION_KIND.INITIAL,
        state: SHOP_APPLICATION_STATE.APPROVED,
      });
      if (!shop.approvedAt || !original?.snapshot)
        throw new ConflictException(
          'Approved Owner identity is required for renewal',
        );
      if (!shop.identityDocumentVersion) {
        shop.identityDocumentVersion = 1;
        shop.identityExpiresOn = original.snapshot.identity.expiresOn;
        shop.identityNextCheckAt = now;
        await manager.save(shop);
      }
      let row = await manager.findOneBy(ShopApplication, {
        shopId,
        applicantId: actorId,
        kind: SHOP_APPLICATION_KIND.RENEWAL,
        state: Not(SHOP_APPLICATION_STATE.APPROVED),
      });
      if (!row) {
        row = await manager.save(
          ShopApplication,
          manager.create(ShopApplication, {
            shopId,
            applicantId: actorId,
            kind: SHOP_APPLICATION_KIND.RENEWAL,
            baseIdentityVersion: shop.identityDocumentVersion,
            state: SHOP_APPLICATION_STATE.DRAFT,
            version: 1,
            revision: 0,
            snapshot: null,
            snapshotFingerprint: null,
            firstCorrectionAt: null,
            correctionDueAt: null,
            submittedAt: null,
            reason: null,
            adminNote: null,
          }),
        );
        await applicationEvent(
          manager,
          row,
          actorId,
          SHOP_APPLICATION_ACTION.CREATED,
        );
      }
      await applicationCommand(
        manager,
        actorId,
        data.requestId,
        row.id,
        payload,
      );
      return this.read.view(manager, row);
    });
  }
  submit(
    actorId: string,
    id: string,
    input: z.input<typeof submitIdentityRenewalSchema>,
  ) {
    const data = submitIdentityRenewalSchema.parse(input);
    const payload = {
      action: SHOP_APPLICATION_ACTION.RENEWAL_SUBMITTED,
      id,
      data,
    };
    return this.db.transaction(async (manager) => {
      const now = await applicationClock(manager);
      const row = await this.access.own(manager, actorId, id);
      if (await applicationReplay(manager, actorId, data.requestId, payload))
        return this.read.view(manager, row);
      if (
        row.kind !== SHOP_APPLICATION_KIND.RENEWAL ||
        !editableApplication(row.state)
      )
        throw new ConflictException('Renewal is not open for submission');
      if (row.version !== data.expectedVersion)
        throw new ConflictException('Renewal version changed');
      const shop = await pendingApplicationShop(manager, row);
      if (
        row.baseIdentityVersion !== shop.identityDocumentVersion ||
        !shop.identityExpiresOn
      )
        throw new ConflictException('Approved identity changed');
      validateApplicantIdentity(data.identity, now);
      const documents = await renewalDocuments(
        manager,
        row,
        data.identity,
        data.documentIds,
      );
      const onTime =
        now < identityGraceDeadline(shop.identityExpiresOn) ||
        (row.correctionDueAt !== null && now < row.correctionDueAt);
      row.timelySubmission = onTime && !shop.identityManualRestriction;
      const logo = shop.logoMediaId
        ? await manager.findOneBy(Media, { id: shop.logoMediaId })
        : null;
      row.snapshot = {
        identity: data.identity,
        shop: {
          id: shop.id,
          name: shop.name,
          description: shop.description,
          logoUrl: logo ? this.storage.getPublicUrl(logo.storageKey) : '',
        },
        pickup: null,
        bank: null,
        documents: documents.map((d) => ({ id: d.id, slot: d.slot })),
      };
      row.snapshotFingerprint = applicationFingerprint(row.snapshot);
      row.state = SHOP_APPLICATION_STATE.SUBMITTED;
      row.version++;
      row.revision++;
      row.submittedAt = now;
      row.reason = null;
      row.adminNote = null;
      await manager.save(row);
      await manager.save(
        ShopApplicationRevision,
        manager.create(ShopApplicationRevision, {
          applicationId: id,
          revision: row.revision,
          snapshot: row.snapshot,
        }),
      );
      for (const document of documents)
        if (document.firstSubmittedRevision === null) {
          document.firstSubmittedRevision = row.revision;
          await manager.save(document);
        }
      shop.identityReviewProtected = row.timelySubmission;
      shop.identityNextCheckAt = now;
      await manager.save(shop);
      await applicationCommand(manager, actorId, data.requestId, id, payload);
      await applicationEvent(
        manager,
        row,
        actorId,
        SHOP_APPLICATION_ACTION.SUBMITTED,
      );
      return this.read.view(manager, row);
    });
  }
}
