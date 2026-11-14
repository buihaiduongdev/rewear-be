import { z } from 'zod';

import {
  MAX_PACKAGE_DIMENSION_CM,
  MAX_PACKAGE_WEIGHT_GRAMS,
  resolveShippingPackage,
  shippingPackageSchema,
} from '@/common/schemas/shipping-package.schema';

describe('Package bounds for carrier estimates', () => {
  it('parses flat positive integer measurements', () => {
    expect(
      shippingPackageSchema.parse({
        weightGrams: 500,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 15,
      }),
    ).toEqual({ weightGrams: 500, lengthCm: 30, widthCm: 20, heightCm: 15 });
  });

  it('rounds centimetres upward rather than understating parcel size', () => {
    expect(
      resolveShippingPackage({
        weightGrams: 300,
        lengthCm: 20.1,
        widthCm: 15.9,
        heightCm: 8,
      }),
    ).toEqual({ weightGrams: 300, lengthCm: 21, widthCm: 16, heightCm: 8 });
  });

  it('rejects negative, nonfinite, zero, or oversized measurements', () => {
    for (const weightGrams of [0, -1, Infinity, MAX_PACKAGE_WEIGHT_GRAMS + 1]) {
      expect(
        shippingPackageSchema.safeParse({
          weightGrams,
          lengthCm: 20,
          widthCm: 15,
          heightCm: 10,
        }).success,
      ).toBe(false);
    }

    for (const lengthCm of [0, -5, Infinity, MAX_PACKAGE_DIMENSION_CM + 1]) {
      expect(
        shippingPackageSchema.safeParse({
          weightGrams: 300,
          lengthCm,
          widthCm: 15,
          heightCm: 10,
        }).success,
      ).toBe(false);
    }
  });

  it('can be converted to JSON Schema for Swagger without throwing', () => {
    expect(() => z.toJSONSchema(shippingPackageSchema)).not.toThrow();
  });
});
