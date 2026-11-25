import { IDENTITY_RENEWAL_POLICY } from '../constants/shop-application.constant';

const { VIETNAM_OFFSET_MS, DAY_MS, GRACE_DAYS } = IDENTITY_RENEWAL_POLICY;

export type IdentitySaleState = {
  identityExpiresOn?: string | null;
  identityManualRestriction?: boolean;
};

/** Expiration date is valid through Vietnam local midnight plus 30 complete following days. */
export function identityGraceDeadline(expiresOn: string): Date {
  return new Date(
    Date.parse(expiresOn + 'T00:00:00Z') -
      VIETNAM_OFFSET_MS +
      (GRACE_DAYS + 1) * DAY_MS,
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
