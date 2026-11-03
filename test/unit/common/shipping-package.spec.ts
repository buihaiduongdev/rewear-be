import {
  resolveShippingPackage,
  shippingPackageSchema,
} from '@/common/schemas/shipping-package.schema';

describe('Package bounds for carrier estimates', () => {
  it('uses fixed upper bounds for both preset choices', () => {
    expect(
      resolveShippingPackage({
        weight: { mode: 'RANGE', preset: 'UP_TO_500_G' },
        size: { mode: 'RANGE', preset: 'BOX_30_20_15_CM' },
      }),
    ).toEqual({ weightGrams: 500, lengthCm: 30, widthCm: 20, heightCm: 15 });
  });
  it('rounds custom centimetres upward rather than understating parcel size', () => {
    expect(
      resolveShippingPackage({
        weight: { mode: 'CUSTOM', grams: 300 },
        size: { mode: 'CUSTOM', lengthCm: 20.1, widthCm: 15.9, heightCm: 8 },
      }),
    ).toEqual({ weightGrams: 300, lengthCm: 21, widthCm: 16, heightCm: 8 });
  });
  it('rejects negative, nonfinite, or oversized custom measurements', () => {
    for (const grams of [0, -1, Infinity, 50001])
      expect(
        shippingPackageSchema.safeParse({
          weight: { mode: 'CUSTOM', grams },
          size: { mode: 'RANGE', preset: 'BOX_20_15_10_CM' },
        }).success,
      ).toBe(false);
  });
});
