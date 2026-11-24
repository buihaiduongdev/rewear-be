import { IDENTITY_RENEWAL_POLICY } from '../constants/shop-application.constant';

const { VIETNAM_OFFSET_MS, DAY_MS, GRACE_DAYS } = IDENTITY_RENEWAL_POLICY;
export type IdentitySaleState = {
  identityExpiresOn?: string | null;
  identityReviewProtected?: boolean;
  identityManualRestriction?: boolean;
  identityCorrectionUntil?: Date | string | null;
};
/** Expiration date is valid through local midnight;30 complete following days. */
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
  if (shop.identityReviewProtected) return true;
  const grace = identityGraceDeadline(shop.identityExpiresOn).getTime();
  const correction = shop.identityCorrectionUntil
    ? new Date(shop.identityCorrectionUntil).getTime()
    : 0;
  return now.getTime() < Math.max(grace, correction);
}
export function publicIdentitySaleState(
  shop: IdentitySaleState,
  now = new Date(),
) {
  return { identitySalesPaused: !shopAllowsIdentitySales(shop, now) };
}
