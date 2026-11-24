import {
  identityGraceDeadline,
  shopAllowsIdentitySales,
} from '@/modules/shop/applications/renewal/identity-sale.policy';

describe('Owner identity renewal sales gate', () => {
  it('keeps the full30-day grace in Vietnam and never treats pending review as an extended clock', () => {
    const shop = {
      identityExpiresOn: '2026-10-01',
      identityReviewProtected: false,
      identityManualRestriction: false,
      identityCorrectionUntil: null,
    };
    expect(identityGraceDeadline(shop.identityExpiresOn).toISOString()).toBe(
      '2026-10-31T17:00:00.000Z',
    );
    expect(
      shopAllowsIdentitySales(shop, new Date('2026-10-31T16:59:59.999Z')),
    ).toBe(true);
    expect(
      shopAllowsIdentitySales(shop, new Date('2026-10-31T17:00:00.000Z')),
    ).toBe(false);
    expect(
      shopAllowsIdentitySales(
        { ...shop, identityReviewProtected: true },
        new Date('2027-01-01'),
      ),
    ).toBe(true);
    expect(
      shopAllowsIdentitySales(
        {
          ...shop,
          identityReviewProtected: true,
          identityManualRestriction: true,
        },
        new Date('2027-01-01'),
      ),
    ).toBe(false);
  });
  it('honors a first fixed correction window and does not invent identity verification for legacy Shops', () => {
    expect(shopAllowsIdentitySales({}, new Date())).toBe(true);
    const shop = {
      identityExpiresOn: '2026-01-01',
      identityCorrectionUntil: new Date('2026-11-01T00:00:00Z'),
    };
    expect(
      shopAllowsIdentitySales(shop, new Date('2026-10-31T23:59:59Z')),
    ).toBe(true);
    expect(
      shopAllowsIdentitySales(shop, new Date('2026-11-01T00:00:00Z')),
    ).toBe(false);
  });
});
