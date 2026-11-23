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

import { ExcessAudit, WalletExcess } from './entities/excess.entity';

export async function excessEvent(
  manager: EntityManager,
  row: WalletExcess,
  actorId: string | null,
  action: string,
  reason: string,
  detail: Record<string, unknown> = {},
) {
  const audit = await manager.save(
    ExcessAudit,
    manager.create(ExcessAudit, {
      excessId: row.id,
      actorId,
      action,
      reason,
      detail,
    }),
  );
  const recipients = new Map(
    (await adminRecipients(manager)).map((r) => [r.userId, r]),
  );
  recipients.set(row.buyerId, personalRecipient(row.buyerId));
  await publishNotification(manager, {
    key: `wallet-excess:${audit.id}`,
    kind: NOTIFICATION_KIND.WALLET_RECOVERY,
    targetType: NOTIFICATION_TARGET.WALLET_RECOVERY,
    sourceId: row.id,
    title: 'Cập nhật điều chỉnh ví',
    body: 'Khoản điều chỉnh ví có cập nhật. Mở hồ sơ để xem căn cứ, số tiền và trạng thái xử lý.',
    mode: row.mode,
    recipients: [...recipients.values()],
  });
}
