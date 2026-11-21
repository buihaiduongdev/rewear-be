import ms from 'ms';

import { MAX_VND_AMOUNT } from '@/common/constants/money.constant';

export const CHAT_SIDE = { BUYER: 'BUYER', SHOP: 'SHOP' } as const;
export const CHAT_CARD = { PRODUCT: 'PRODUCT', ORDER: 'ORDER' } as const;
export const CHAT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
] as const;
export const CHAT_POLICY = {
  TEXT_LENGTH: 4000,
  MAX_MEDIA: 6,
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100,
  IMAGE_BYTES: 10 * 1024 * 1024,
  VIDEO_BYTES: 50 * 1024 * 1024,
  UPLOAD_TTL_MS: ms('15m'),
  UPLOADS_PER_ACTOR_CONVERSATION_DAY: 200,
  DAY_MS: ms('1d'),
  MAX_SEQUENCE: MAX_VND_AMOUNT,
} as const;
