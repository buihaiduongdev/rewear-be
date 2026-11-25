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

export type AdministrativeProvince = z.infer<
  typeof administrativeProvinceSchema
>;
export type AdministrativeDistrict = z.infer<
  typeof administrativeDistrictSchema
>;
export type AdministrativeWard = z.infer<typeof administrativeWardSchema>;

export type ResolvedVietnamAddress = {
  provinceId: number;
  provinceName: string;
  districtId: number;
  districtName: string;
  wardCode: string;
  wardName: string;
};
