import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, In } from 'typeorm';
import z from 'zod';

import {
  SHOP_APPLICATION_ACTION,
  SHOP_APPLICATION_STATE,
} from './constants/shop-application.constant';
import {
  ShopApplication,
  ShopApplicationDocument,
  ShopApplicationRevision,
} from './entities/shop-application.entity';
import {
  applicationFingerprint,
  buildApplicationSnapshot,
  editableApplication,
  pendingApplicationShop,
  validateApplicantIdentity,
} from './policies/shop-application.policy';
import {
  applicationCreateSchema,
  applicationSubmitSchema,
} from './schemas/shop-application.schema';
import { ShopApplicationReadService } from './shop-application-read.service';
import {
  applicationClock,
  applicationCommand,
  applicationReplay,
  ShopApplicationAccess,
} from './shop-application.access';
import { applicationEvent } from './shop-application.lifecycle';

@Injectable()
export class ShopApplicationService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ShopApplicationAccess,
    private readonly read: ShopApplicationReadService,
  ) {}
  create(
    userId: string,
    shopId: string,
    input: z.input<typeof applicationCreateSchema>,
  ) {
    const data = applicationCreateSchema.parse(input);
    const payload = { action: SHOP_APPLICATION_ACTION.CREATED, shopId, data };
    return this.db.transaction(async (manager) => {
      await applicationClock(manager);
      await this.access.owner(manager, userId, shopId);
      const command = await applicationReplay(
        manager,
        userId,
        data.requestId,
        payload,
      );
      if (command)
        return this.read.view(
          manager,
          await this.access.own(manager, userId, command.applicationId),
        );
      let row = await manager.findOneBy(ShopApplication, {
        shopId,
        applicantId: userId,
      });
      if (!row) {
        await pendingApplicationShop(manager, { shopId });
        row = await manager.save(
          ShopApplication,
          manager.create(ShopApplication, {
            shopId,
            applicantId: userId,
            state: SHOP_APPLICATION_STATE.DRAFT,
            version: 1,
            revision: 0,
            snapshot: null,
            snapshotFingerprint: null,
            submittedAt: null,
            reason: null,
            adminNote: null,
          }),
        );
        await applicationEvent(
          manager,
          row,
          userId,
          SHOP_APPLICATION_ACTION.CREATED,
        );
      }
      await applicationCommand(
        manager,
        userId,
        data.requestId,
        row.id,
        payload,
      );
      return this.read.view(manager, row);
    });
  }
  submit(
    userId: string,
    id: string,
    input: z.input<typeof applicationSubmitSchema>,
  ) {
    const data = applicationSubmitSchema.parse(input);
    const payload = { action: SHOP_APPLICATION_ACTION.SUBMITTED, id, data };
    return this.db.transaction(async (manager) => {
      const now = await applicationClock(manager);
      const row = await this.access.own(manager, userId, id);
      if (await applicationReplay(manager, userId, data.requestId, payload))
        return this.read.view(manager, row);
      if (row.version !== data.expectedVersion)
        throw new ConflictException('Application version changed');
      if (!editableApplication(row.state))
        throw new ConflictException('Application is not open for submission');
      validateApplicantIdentity(data.identity, now);
      const snapshot = await buildApplicationSnapshot(
        manager,
        row,
        data.identity,
        data.bankAccountId,
        data.documentIds,
      );
      row.snapshot = snapshot;
      row.snapshotFingerprint = applicationFingerprint(snapshot);
      row.state = SHOP_APPLICATION_STATE.SUBMITTED;
      row.submittedAt = now;
      row.version++;
      row.revision++;
      row.reason = null;
      row.adminNote = null;
      await manager.save(row);
      await manager.save(
        ShopApplicationRevision,
        manager.create(ShopApplicationRevision, {
          applicationId: row.id,
          revision: row.revision,
          snapshot,
        }),
      );
      const documents = await manager.findBy(ShopApplicationDocument, {
        id: In(data.documentIds),
        applicationId: id,
      });
      for (const document of documents) {
        if (document.firstSubmittedRevision === null) {
          document.firstSubmittedRevision = row.revision;
          await manager.save(document);
        }
      }
      await applicationCommand(manager, userId, data.requestId, id, payload);
      await applicationEvent(
        manager,
        row,
        userId,
        SHOP_APPLICATION_ACTION.SUBMITTED,
      );
      return this.read.view(manager, row);
    });
  }
  find(userId: string, id: string) {
    return this.read.detail(userId, id);
  }
}
