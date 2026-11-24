import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { DataSource } from 'typeorm';
import z from 'zod';

import {
  SHOP_APPLICATION_KIND,
  SHOP_APPLICATION_STATE,
} from './constants/shop-application.constant';
import { approveShopApplication } from './policies/approve-shop-application';
import { pendingApplicationShop } from './policies/shop-application.policy';
import { decideOwnerRenewal } from './renewal/renewal-decision.policy';
import { applicationDecisionSchema } from './schemas/shop-application.schema';
import { ShopApplicationReadService } from './shop-application-read.service';
import {
  applicationClock,
  applicationCommand,
  applicationReplay,
  ShopApplicationAccess,
} from './shop-application.access';
import { applicationEvent } from './shop-application.lifecycle';

@Injectable()
export class ShopApplicationAdminService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ShopApplicationAccess,
    private readonly read: ShopApplicationReadService,
  ) {}
  decide(
    actorId: string,
    id: string,
    input: z.input<typeof applicationDecisionSchema>,
  ) {
    const data = applicationDecisionSchema.parse(input);
    const payload = { action: data.outcome, id, data };
    return this.db.transaction(async (manager) => {
      const now = await applicationClock(manager);
      const row = await this.access.admin(manager, actorId, id);
      if (actorId === row.applicantId)
        throw new ForbiddenException(
          'An Admin cannot review their own application',
        );
      if (await applicationReplay(manager, actorId, data.requestId, payload))
        return this.read.view(manager, row, true);
      if (row.version !== data.expectedVersion)
        throw new ConflictException('Application version changed');
      const pendingReview =
        row.state === SHOP_APPLICATION_STATE.SUBMITTED && row.snapshot !== null;
      if (!pendingReview)
        throw new ConflictException('Application is not awaiting review');
      await this.access.owner(manager, row.applicantId, row.shopId);
      const shop = await pendingApplicationShop(manager, row);
      if (row.kind === SHOP_APPLICATION_KIND.RENEWAL)
        await decideOwnerRenewal(manager, row, shop, data, now);
      else if (data.outcome === SHOP_APPLICATION_STATE.APPROVED)
        await approveShopApplication(manager, row, shop, now);
      row.state = data.outcome;
      row.version++;
      row.reason = data.reason;
      row.reasonCategory = data.reasonCategory ?? null;
      row.adminNote = data.adminNote;
      await manager.save(row);
      await applicationCommand(manager, actorId, data.requestId, id, payload);
      await applicationEvent(
        manager,
        row,
        actorId,
        data.outcome,
        data.reason,
        data.adminNote,
        data.identityCheckEvidence ?? null,
        data.samePersonConfirmed ?? null,
      );
      return this.read.view(manager, row, true);
    });
  }
}
