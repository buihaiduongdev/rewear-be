import ms from 'ms';

export const COD_RESTRICTION_CAUSE = {
  REPEATED_CANCELLATION: 'REPEATED_CANCELLATION',
} as const;
export const COD_CANCELLATION_REASON = {
  CHANGE_OF_MIND: 'CHANGE_OF_MIND',
} as const;
export const COD_MAX_ORDER_TOTAL = 50000000;
export const COD_MAX_PENDING_CHECKOUTS = 3;
export const COD_MAX_ACTIVE_CHECKOUTS = 5;
export const COD_MAX_PENDING_ITEMS = 20;
export const COD_CANCELLATION_THRESHOLD = 5;
export const COD_CANCELLATION_WINDOW_MS = ms('1d');
export const COD_EPISODE_WINDOW_MS = ms('30d');
export const COD_MANUAL_REVIEW_EPISODES = 2;
export const COD_FIRST_BLOCK_MS = ms('24h');
export const COD_REPEAT_BLOCK_MS = ms('72h');
