import ms from 'ms';

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
  DAY_MS: ms('1d'),
} as const;
