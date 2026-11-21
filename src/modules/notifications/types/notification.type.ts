import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';

import {
  EMAIL_STATE,
  NOTIFICATION_SCOPE,
} from '../constants/notification.constant';

export type NotificationScope =
  (typeof NOTIFICATION_SCOPE)[keyof typeof NOTIFICATION_SCOPE];
export type EmailState = (typeof EMAIL_STATE)[keyof typeof EMAIL_STATE];
export type NotificationRecipient = {
  userId: string;
  scope: NotificationScope;
  shopId?: string;
  permission?: string;
};
export type NotificationInput = {
  targetType?: string;
  key: string;
  kind: string;
  sourceId: string;
  title: string;
  body: string;
  mode: ReconciliationMode | null;
  recipients: NotificationRecipient[];
  email?: boolean;
  occurredAt?: Date;
};
