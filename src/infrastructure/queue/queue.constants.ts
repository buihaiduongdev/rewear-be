export const QUEUE_NAMES = {
  DOMAIN_EVENTS: 'domain-events',
  EMAIL_NOTIFICATIONS: 'email-notifications',
} as const;

export type TQueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
