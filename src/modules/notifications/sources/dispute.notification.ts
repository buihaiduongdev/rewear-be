import type { EntityManager } from 'typeorm';

import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import type { DisputeCase } from '@/modules/dispute/entities/dispute-case.entity';
import {
  NOTIFICATION_KIND,
  NOTIFICATION_TARGET,
} from '@/modules/notifications/constants/notification.constant';
import { publishNotification } from '@/modules/notifications/publish-notification';
import {
  adminRecipients,
  personalRecipient,
  shopRecipients,
} from '@/modules/notifications/sources/notification-recipients';

export async function notifyDispute(
  manager: EntityManager,
  disputeCase: Pick<DisputeCase, 'id' | 'orderId' | 'buyerId' | 'shopId'>,
  event: string,
  options: {
    includeAdmins?: boolean;
    email?: boolean;
    mode?: ReconciliationMode | null;
  } = {},
) {
  const mode = options.mode ?? null;
  await publishNotification(manager, {
    key: `dispute:${event}:buyer`,
    kind: NOTIFICATION_KIND.DISPUTE,
    targetType: NOTIFICATION_TARGET.ORDER,
    sourceId: disputeCase.orderId,
    title: 'Cập nhật khiếu nại',
    body: 'Hồ sơ khiếu nại có cập nhật. Mở đơn hàng để xem nội dung và thời hạn xử lý.',
    mode,
    email: options.email,
    recipients: [personalRecipient(disputeCase.buyerId)],
  });
  const shop = await shopRecipients(
    manager,
    disputeCase.shopId,
    SHOP_PERMISSIONS.SHOP_OWNER,
  );
  if (shop.length) {
    await publishNotification(manager, {
      key: `dispute:${event}:shop`,
      kind: NOTIFICATION_KIND.DISPUTE,
      targetType: NOTIFICATION_TARGET.ORDER,
      sourceId: disputeCase.orderId,
      title: 'Cập nhật khiếu nại',
      body: 'Hồ sơ khiếu nại của đơn hàng có cập nhật. Mở đơn hàng để xem và xử lý.',
      mode,
      email: options.email,
      recipients: shop,
    });
  }
  if (options.includeAdmins) {
    const admins = await adminRecipients(manager);
    if (admins.length) {
      await publishNotification(manager, {
        key: `dispute:${event}:admins`,
        kind: NOTIFICATION_KIND.DISPUTE,
        targetType: NOTIFICATION_TARGET.DISPUTE_CASE,
        sourceId: disputeCase.id,
        title: 'Cập nhật khiếu nại cần phân xử',
        body: 'Hồ sơ khiếu nại có cập nhật cần Admin xem xét.',
        mode,
        recipients: admins,
      });
    }
  }
}
