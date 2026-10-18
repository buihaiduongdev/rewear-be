import z from 'zod';

export const administrativeProvinceSchema = z.object({
  code: z.string(),
  name: z.string(),
  type: z.string(),
});

export const administrativeProvinceListSchema = z.array(
  administrativeProvinceSchema,
);

export const administrativeWardSchema = z.object({
  code: z.string(),
  name: z.string(),
  type: z.string(),
  provinceCode: z.string(),
});

export const administrativeWardListSchema = z.array(administrativeWardSchema);
