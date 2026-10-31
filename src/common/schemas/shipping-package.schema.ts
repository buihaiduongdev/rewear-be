import z from 'zod';

// Preset IDs encode fixed upper bounds. Add new IDs instead of changing their meaning.
export const WEIGHT_PRESETS = {
  UP_TO_250_G: { label: 'Up to 250 g', upperGrams: 250 },
  UP_TO_500_G: { label: 'Up to 500 g', upperGrams: 500 },
  UP_TO_1000_G: { label: 'Up to 1 kg', upperGrams: 1000 },
  UP_TO_2000_G: { label: 'Up to 2 kg', upperGrams: 2000 },
  UP_TO_5000_G: { label: 'Up to 5 kg', upperGrams: 5000 },
} as const;
export const SIZE_PRESETS = {
  BOX_20_15_10_CM: {
    label: 'Up to 20 × 15 × 10 cm',
    lengthCm: 20,
    widthCm: 15,
    heightCm: 10,
  },
  BOX_30_20_15_CM: {
    label: 'Up to 30 × 20 × 15 cm',
    lengthCm: 30,
    widthCm: 20,
    heightCm: 15,
  },
  BOX_40_30_20_CM: {
    label: 'Up to 40 × 30 × 20 cm',
    lengthCm: 40,
    widthCm: 30,
    heightCm: 20,
  },
  BOX_50_40_30_CM: {
    label: 'Up to 50 × 40 × 30 cm',
    lengthCm: 50,
    widthCm: 40,
    heightCm: 30,
  },
} as const;
// Application input bounds, not a claim that every carrier accepts these parcels.
export const MAX_PACKAGE_WEIGHT_GRAMS = 50000;
export const MAX_PACKAGE_DIMENSION_CM = 200;
const dimension = z.number().positive().max(MAX_PACKAGE_DIMENSION_CM);
export const shippingPackageSchema = z.strictObject({
  weight: z.discriminatedUnion('mode', [
    z.strictObject({
      mode: z.literal('RANGE'),
      preset: z.enum(
        Object.keys(WEIGHT_PRESETS) as [
          keyof typeof WEIGHT_PRESETS,
          ...(keyof typeof WEIGHT_PRESETS)[],
        ],
      ),
    }),
    z.strictObject({
      mode: z.literal('CUSTOM'),
      grams: z.number().int().positive().max(MAX_PACKAGE_WEIGHT_GRAMS),
    }),
  ]),
  size: z.discriminatedUnion('mode', [
    z.strictObject({
      mode: z.literal('RANGE'),
      preset: z.enum(
        Object.keys(SIZE_PRESETS) as [
          keyof typeof SIZE_PRESETS,
          ...(keyof typeof SIZE_PRESETS)[],
        ],
      ),
    }),
    z.strictObject({
      mode: z.literal('CUSTOM'),
      lengthCm: dimension,
      widthCm: dimension,
      heightCm: dimension,
    }),
  ]),
});
export type ShippingPackage = z.output<typeof shippingPackageSchema>;
export const resolvedShippingPackageSchema = z.object({
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
  const size =
    input.size.mode === 'RANGE' ? SIZE_PRESETS[input.size.preset] : input.size;
  return {
    weightGrams:
      input.weight.mode === 'RANGE'
        ? WEIGHT_PRESETS[input.weight.preset].upperGrams
        : input.weight.grams,
    lengthCm: Math.ceil(size.lengthCm),
    widthCm: Math.ceil(size.widthCm),
    heightCm: Math.ceil(size.heightCm),
  };
}
export const shippingPackageOptionsSchema = z.object({
  weightPresets: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      upperGrams: z.number().int(),
    }),
  ),
  sizePresets: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      lengthCm: z.number().int(),
      widthCm: z.number().int(),
      heightCm: z.number().int(),
    }),
  ),
  customLimits: z.object({
    maxWeightGrams: z.number().int(),
    maxDimensionCm: z.number().int(),
  }),
});
