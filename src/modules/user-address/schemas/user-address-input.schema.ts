import z from 'zod';

import {
  optionalInput,
  trimmedTextSchema,
} from '@/common/schemas/request.schema';

export const createUserAddressSchema = z.strictObject({
  recipientName: trimmedTextSchema.min(1).max(100),
  label: trimmedTextSchema.min(1).max(50).nullish(),
  phone: trimmedTextSchema.regex(/^\+?[0-9]{8,15}$/),
  addressLine1: trimmedTextSchema.min(1).max(255),
  addressLine2: trimmedTextSchema.min(1).max(255).nullish(),
  countryCode: optionalInput(trimmedTextSchema.pipe(z.literal('VN'))),
  provinceCode: trimmedTextSchema.regex(/^\d{2}$/),
  wardCode: trimmedTextSchema.regex(/^\d{5}$/),
  postalCode: trimmedTextSchema.min(1).max(20).nullish(),
  deliveryInstructions: trimmedTextSchema.min(1).max(255).nullish(),
  isDefault: optionalInput(z.boolean()),
});

export const updateUserAddressSchema = createUserAddressSchema
  .partial()
  .extend({
    recipientName: optionalInput(createUserAddressSchema.shape.recipientName),
    phone: optionalInput(createUserAddressSchema.shape.phone),
    addressLine1: optionalInput(createUserAddressSchema.shape.addressLine1),
    provinceCode: optionalInput(createUserAddressSchema.shape.provinceCode),
    wardCode: optionalInput(createUserAddressSchema.shape.wardCode),
  });

export type CreateUserAddressInput = z.output<typeof createUserAddressSchema>;
export type UpdateUserAddressInput = z.output<typeof updateUserAddressSchema>;
