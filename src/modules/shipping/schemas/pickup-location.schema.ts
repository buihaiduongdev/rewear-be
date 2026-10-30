import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { trimmedTextSchema } from '@/common/schemas/request.schema';
import { createUserAddressSchema } from '@/modules/user-address/schemas/user-address-input.schema';

export const savePickupLocationSchema = createUserAddressSchema
  .pick({
    phone: true,
    addressLine1: true,
    provinceCode: true,
    wardCode: true,
  })
  .extend({ contactName: trimmedTextSchema.min(1).max(100) });
export type SavePickupLocationInput = z.output<typeof savePickupLocationSchema>;

export const pickupLocationSchema = z.object({
  id: z.uuid(),
  contactName: z.string(),
  phone: z.string(),
  addressLine1: z.string(),
  countryCode: z.literal('VN'),
  provinceCode: z.string(),
  provinceName: z.string(),
  wardCode: z.string(),
  wardName: z.string(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export const pickupLocationResultSchema = z.object({
  location: pickupLocationSchema.nullable(),
});
