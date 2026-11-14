import z from 'zod';

// Application input bounds, not a claim that every carrier accepts these parcels.
export const MAX_PACKAGE_WEIGHT_GRAMS = 50000;
export const MAX_PACKAGE_DIMENSION_CM = 200;

const dimension = z
  .number()
  .positive('Dimension must be positive')
  .max(
    MAX_PACKAGE_DIMENSION_CM,
    `Dimension cannot exceed ${MAX_PACKAGE_DIMENSION_CM} cm`,
  );

export const shippingPackageSchema = z.strictObject({
  weightGrams: z
    .number()
    .int('Weight must be an integer')
    .positive('Weight must be positive')
    .max(
      MAX_PACKAGE_WEIGHT_GRAMS,
      `Weight cannot exceed ${MAX_PACKAGE_WEIGHT_GRAMS} grams`,
    ),
  lengthCm: dimension,
  widthCm: dimension,
  heightCm: dimension,
});

export type ShippingPackage = z.output<typeof shippingPackageSchema>;

export const resolvedShippingPackageSchema = z.strictObject({
  weightGrams: z.number().int().positive(),
  lengthCm: z.number().int().positive(),
  widthCm: z.number().int().positive(),
  heightCm: z.number().int().positive(),
});

export type ResolvedShippingPackage = z.output<
  typeof resolvedShippingPackageSchema
>;

// A conservative bounding stack of each item's declared outer box, never a split.
export function aggregateParcel(
  items: Array<ResolvedShippingPackage | null>,
): ResolvedShippingPackage {
  if (!items.length || items.some((item) => !item))
    throw new Error('PACKAGE_REQUIRED');
  const parcel = { weightGrams: 0, lengthCm: 0, widthCm: 0, heightCm: 0 };
  for (const item of items) {
    if (!item || !resolvedShippingPackageSchema.safeParse(item).success)
      throw new Error('PACKAGE_REQUIRED');
    const [length, width, height] = [
      item.lengthCm,
      item.widthCm,
      item.heightCm,
    ].sort((a, b) => b - a);
    parcel.weightGrams += item.weightGrams;
    parcel.lengthCm = Math.max(parcel.lengthCm, length);
    parcel.widthCm = Math.max(parcel.widthCm, width);
    parcel.heightCm += height;
  }
  if (
    parcel.weightGrams > MAX_PACKAGE_WEIGHT_GRAMS ||
    [parcel.lengthCm, parcel.widthCm, parcel.heightCm].some(
      (v) => v > MAX_PACKAGE_DIMENSION_CM,
    )
  )
    throw new Error('PARCEL_LIMIT_EXCEEDED');
  return parcel;
}

export function resolveShippingPackage(
  input: ShippingPackage,
): ResolvedShippingPackage {
  const parsed = shippingPackageSchema.parse(input);
  return {
    weightGrams: parsed.weightGrams,
    lengthCm: Math.ceil(parsed.lengthCm),
    widthCm: Math.ceil(parsed.widthCm),
    heightCm: Math.ceil(parsed.heightCm),
  };
}
