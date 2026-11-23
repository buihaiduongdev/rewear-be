import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { trimmedTextSchema } from '@/common/schemas/request.schema';
import { createUserAddressSchema } from '@/modules/user-address/schemas/user-address-input.schema';

export const savePickupLocationSchema = createUserAddressSchema
  .pick({
    phone: true,
    addressLine1: true,
    provinceId: true,
    districtId: true,
    wardCode: true,
  })
  .extend({ contactName: trimmedTextSchema.min(1).max(100) });
export type SavePickupLocationInput = z.output<typeof savePickupLocationSchema>;

export const pickupLocationSchema = z.object({
  id: z.uuid(),
  ghnShopId: z.number().int().positive().nullable(),
  ghnSyncStatus: z.enum([
    'NOT_CONNECTED',
    'CREATING',
    'CONNECTED',
    'UNKNOWN',
    'STALE',
  ]),
  contactName: z.string(),
  phone: z.string(),
  addressLine1: z.string(),
  countryCode: z.literal('VN'),
  provinceId: z.number().int().positive(),
  provinceName: z.string(),
  districtId: z.number().int().positive(),
  districtName: z.string(),
  wardCode: z.string(),
  wardName: z.string(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export const pickupLocationResultSchema = z.object({
  location: pickupLocationSchema.nullable(),
});

export const connectGhnShopSchema = z
  .object({
    provinceId: z.number().int().positive().optional(),
    districtId: z.number().int().positive().optional(),
    wardCode: z.string().trim().min(1).max(20).optional(),
  })
  .optional()
  .default({});
export type ConnectGhnShopInput = z.output<typeof connectGhnShopSchema>;
