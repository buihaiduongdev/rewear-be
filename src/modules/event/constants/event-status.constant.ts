export const OUTBOX_EVENT_STATUSES = {
  PENDING: 'pending',
  ENQUEUED: 'enqueued',
  FAILED: 'failed',
} as const;

export type TOutboxEventStatus =
  (typeof OUTBOX_EVENT_STATUSES)[keyof typeof OUTBOX_EVENT_STATUSES];
