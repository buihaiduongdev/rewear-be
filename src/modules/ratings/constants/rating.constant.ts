export const RATING_MODES = ['EVIDENCE', 'SIMULATION'] as const;
export const RATING_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
] as const;
export const RATING_POLICY = {
  MAX_MEDIA: 6,
  MAX_UPLOADS_PER_BUYER_SHOP_DAY: 200,
  IMAGE_BYTES: 10 * 1024 * 1024,
  VIDEO_BYTES: 50 * 1024 * 1024,
} as const;
export const RATING_MODERATION_BASES = [
  'CONTENT_VIOLATION',
  'FRAUD',
  'INELIGIBLE',
  'REVIEW_APPROVED',
] as const;
