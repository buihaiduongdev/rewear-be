import type { EntityManager } from 'typeorm';

import {
  NOTIFICATION_KIND,
  NOTIFICATION_TARGET,
} from '@/modules/notifications/constants/notification.constant';
import { publishNotification } from '@/modules/notifications/publish-notification';
import {
  adminRecipients,
  personalRecipient,
} from '@/modules/notifications/sources/notification-recipients';

import { SHOP_APPLICATION_ACTION } from './constants/shop-application.constant';
import {
  ShopApplication,
  ShopApplicationAudit,
} from './entities/shop-application.entity';

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
  const owner = personalRecipient(row.applicantId);
  // Only the applicant gets important-event email; Admin queue notices stay in-app.
  const decision = (
    [
      SHOP_APPLICATION_ACTION.APPROVED,
      SHOP_APPLICATION_ACTION.REJECTED,
      SHOP_APPLICATION_ACTION.NEEDS_INFO,
    ] as readonly string[]
  ).includes(action);
  await publishNotification(manager, {
    key: `shop-application:${row.id}:${row.version}:applicant`,
    kind: NOTIFICATION_KIND.SHOP_APPLICATION,
    targetType: NOTIFICATION_TARGET.SHOP_APPLICATION,
    sourceId: row.id,
    title: 'Cập nhật hồ sơ Shop',
    body: 'Hồ sơ Shop đã có cập nhật. Mở hồ sơ sau đăng nhập để xem trạng thái và hướng xử lý.',
    mode: null,
    email: decision,
    recipients: [owner],
  });
  const admins = (await adminRecipients(manager)).filter(
    (r) => r.userId !== row.applicantId,
  );
  if (admins.length)
    await publishNotification(manager, {
      key: `shop-application:${row.id}:${row.version}:admins`,
      kind: NOTIFICATION_KIND.SHOP_APPLICATION,
      targetType: NOTIFICATION_TARGET.SHOP_APPLICATION,
      sourceId: row.id,
      title: 'Cập nhật xét duyệt Shop',
      body: 'Hồ sơ Shop có cập nhật cần theo dõi trong hàng đợi xét duyệt.',
      mode: null,
      recipients: admins,
    });
}
