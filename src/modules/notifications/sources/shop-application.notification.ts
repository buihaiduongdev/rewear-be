import { randomUUID } from 'node:crypto';

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
import { SHOP_APPLICATION_ACTION } from '@/modules/shop/applications/constants/shop-application.constant';
import type { ShopApplication } from '@/modules/shop/applications/entities';

export async function notifyShopApplication(
  manager: EntityManager,
  row: ShopApplication,
  action: string,
) {
  const eventId = randomUUID();
  const owner = personalRecipient(row.applicantId);
  const decision = (
    [
      SHOP_APPLICATION_ACTION.APPROVED,
      SHOP_APPLICATION_ACTION.REJECTED,
      SHOP_APPLICATION_ACTION.NEEDS_INFO,
    ] as readonly string[]
  ).includes(action);
  await publishNotification(manager, {
    key: `shop-application:${row.id}:${eventId}:applicant`,
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
      key: `shop-application:${row.id}:${eventId}:admins`,
      kind: NOTIFICATION_KIND.SHOP_APPLICATION,
      targetType: NOTIFICATION_TARGET.SHOP_APPLICATION,
      sourceId: row.id,
      title: 'Cập nhật xét duyệt Shop',
      body: 'Hồ sơ Shop có cập nhật cần theo dõi trong hàng đợi xét duyệt.',
      mode: null,
      recipients: admins,
    });
}
