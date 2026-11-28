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
  MAX_DOCUMENTS: 3,
} as const;

export const IDENTITY_IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type IdentitySaleState = {
  identityExpiresOn?: string | null;
  identityManualRestriction?: boolean;
};

/** Expiration date is valid through Vietnam local midnight plus 30 complete following days. */
export function identityGraceDeadline(expiresOn: string): Date {
  return new Date(
    Date.parse(expiresOn + 'T00:00:00Z') -
      IDENTITY_RENEWAL_POLICY.VIETNAM_OFFSET_MS +
      (IDENTITY_RENEWAL_POLICY.GRACE_DAYS + 1) * IDENTITY_RENEWAL_POLICY.DAY_MS,
  );
}

export function shopAllowsIdentitySales(
  shop: IdentitySaleState,
  now = new Date(),
): boolean {
  if (shop.identityManualRestriction) return false;
  if (!shop.identityExpiresOn) return true;
  return (
    now.getTime() < identityGraceDeadline(shop.identityExpiresOn).getTime()
  );
}

export function publicIdentitySaleState(
  shop: IdentitySaleState,
  now = new Date(),
) {
  return { identitySalesPaused: !shopAllowsIdentitySales(shop, now) };
}
