import { aggregateParcel as aggregate } from '@/common/schemas/shipping-package.schema';

const small = { weightGrams: 300, lengthCm: 20, widthCm: 15, heightCm: 10 };
const large = { weightGrams: 500, lengthCm: 30, widthCm: 20, heightCm: 15 };

describe('One source, one conservative parcel', () => {
  it('combines two boxes into one weighted bounding stack, not two fees', () => {
    expect(aggregate([small, large])).toEqual({
      weightGrams: 800,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 25,
    });
    expect(aggregate([large, small])).toEqual({
      weightGrams: 800,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 25,
    });
  });
  it('allows box rotation but rejects missing packaging instead of guessing', () => {
    expect(
      aggregate([
        { weightGrams: 300, lengthCm: 10, widthCm: 20, heightCm: 15 },
      ]),
    ).toEqual(small);
    expect(() => aggregate([small, null])).toThrow('PACKAGE_REQUIRED');
    expect(() => aggregate([])).toThrow('PACKAGE_REQUIRED');
  });
  it('refuses an oversized combined parcel instead of splitting a seller', () => {
    expect(() => aggregate([{ ...small, weightGrams: 50000 }, small])).toThrow(
      'PARCEL_LIMIT_EXCEEDED',
    );
    expect(() => aggregate(Array.from({ length: 21 }, () => small))).toThrow(
      'PARCEL_LIMIT_EXCEEDED',
    );
  });
});
