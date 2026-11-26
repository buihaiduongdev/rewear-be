import type { EntityManager } from 'typeorm';

import { notifyShopApplication } from '@/modules/notifications/sources/shop-application.notification';

import { type ShopApplication, ShopApplicationAudit } from './entities';

export async function applicationEvent(
  manager: EntityManager,
  row: ShopApplication,
  actorId: string,
  action: string,
  reason: string | null = null,
  adminNote: string | null = null,
  identityCheckEvidence: string | null = null,
  samePersonConfirmed: boolean | null = null,
) {
  await manager.save(
    ShopApplicationAudit,
    manager.create(ShopApplicationAudit, {
      applicationId: row.id,
      actorId,
      action,
      version: row.version,
      revision: row.revision,
      reason,
      adminNote,
      identityCheckEvidence,
      reasonCategory: row.reasonCategory ?? null,
      samePersonConfirmed,
    }),
  );
  await notifyShopApplication(manager, row, action);
}
