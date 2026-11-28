import {
  identityGraceDeadline,
  publicIdentitySaleState,
  shopAllowsIdentitySales,
} from '@/modules/shop/applications/constants/shop-application.constant';

describe('Owner identity renewal sales gate', () => {
  it('enforces the full 30-day grace period in Vietnam time and manual restriction', () => {
    const shop = {
      identityExpiresOn: '2026-10-01',
      identityManualRestriction: false,
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
        { ...shop, identityManualRestriction: true },
        new Date('2026-10-02T00:00:00.000Z'),
      ),
    ).toBe(false);
    expect(
      publicIdentitySaleState(shop, new Date('2026-10-31T17:00:00.000Z')),
    ).toEqual({ identitySalesPaused: true });
  });

  it('allows sales for legacy shops without tracked identity expiry', () => {
    expect(shopAllowsIdentitySales({}, new Date())).toBe(true);
  });
});
