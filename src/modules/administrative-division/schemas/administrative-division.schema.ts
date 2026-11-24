import z from 'zod';

export const administrativeProvinceSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
});

export const administrativeProvinceListSchema = z.array(
  administrativeProvinceSchema,
);

export const administrativeDistrictSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  provinceId: z.number().int().positive(),
});

export const administrativeDistrictListSchema = z.array(
  administrativeDistrictSchema,
);

export const administrativeWardSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  districtId: z.number().int().positive(),
});

export const administrativeWardListSchema = z.array(administrativeWardSchema);
