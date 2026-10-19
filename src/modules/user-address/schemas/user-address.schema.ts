import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';

export const userAddressSchema = z.object({
  id: z.uuid(),
  recipientName: z.string(),
  label: z.string().nullable(),
  phone: z.string(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  countryCode: z.string(),
  provinceCode: z.string(),
  provinceName: z.string(),
  wardCode: z.string(),
  wardName: z.string(),
  postalCode: z.string().nullable(),
  deliveryInstructions: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const userAddressListSchema = z.array(userAddressSchema);
