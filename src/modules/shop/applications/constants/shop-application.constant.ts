import ms from 'ms';

export const SHOP_APPLICATION_KIND = {
  INITIAL: 'INITIAL',
  RENEWAL: 'RENEWAL',
} as const;

export const SHOP_APPLICATION_STATE = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  NEEDS_INFO: 'NEEDS_INFO',
  REJECTED: 'REJECTED',
  APPROVED: 'APPROVED',
} as const;

export const SHOP_APPLICATION_ACTION = {
  CREATED: 'CREATED',
  SUBMITTED: 'SUBMITTED',
  NEEDS_INFO: 'NEEDS_INFO',
  REJECTED: 'REJECTED',
  APPROVED: 'APPROVED',
} as const;

export const IDENTITY_DOCUMENT_TYPE = {
  NATIONAL_ID: 'NATIONAL_ID',
  PASSPORT: 'PASSPORT',
} as const;

export const IDENTITY_DOCUMENT_SLOT = {
  FRONT: 'FRONT',
  BACK: 'BACK',
  PASSPORT: 'PASSPORT',
} as const;

export const IDENTITY_RENEWAL_POLICY = {
  GRACE_DAYS: 30,
  DAY_MS: ms('1d'),
  VIETNAM_OFFSET_MS: ms('7h'),
  BATCH_SIZE: 50,
} as const;

export const SHOP_APPLICATION_POLICY = {
  MIN_AGE: 18,
  MAX_IMAGE_BYTES: 10 * 1024 * 1024,
  UPLOADS_PER_DAY: 100,
  DAY_MS: ms('1d'),
  MAX_DOCUMENTS: 3,
} as const;

export const IDENTITY_IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
