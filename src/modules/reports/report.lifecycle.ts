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

import { ReportAudit, ViolationReport } from './entities/report.entity';
import type { ReportAction } from './types/report.type';

export async function recordReportAction(
  manager: EntityManager,
  row: ViolationReport,
  actorId: string,
  action: ReportAction,
  publicReason: string | null = null,
  adminNote: string | null = null,
  effect: Record<string, unknown> | null = null,
) {
  await manager.save(
    ReportAudit,
    manager.create(ReportAudit, {
      reportId: row.id,
      actorId,
      action,
      version: row.version,
      status: row.status,
      publicReason,
      adminNote,
      effect,
    }),
  );
  const recipients = new Map(
    (await adminRecipients(manager)).map((item) => [item.userId, item]),
  );
  recipients.set(row.reporterId, personalRecipient(row.reporterId));
  await publishNotification(manager, {
    key: `violation-report:${row.id}:${row.version}:${action}`,
    kind: NOTIFICATION_KIND.VIOLATION_REPORT,
    targetType: NOTIFICATION_TARGET.VIOLATION_REPORT,
    sourceId: row.id,
    title: 'Cập nhật báo cáo vi phạm',
    body: 'Báo cáo vi phạm đã có cập nhật. Mở báo cáo để xem tình trạng và kết quả xử lý.',
    mode: null,
    recipients: [...recipients.values()],
  });
}
