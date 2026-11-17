import z from 'zod';

import {
  optionalInput,
  trimmedTextSchema,
  uuidSchema,
} from '@/common/schemas/request.schema';

import { ShopStatus } from '../enums';

export const createShopSchema = z.strictObject({
  name: trimmedTextSchema.min(1).max(100),
  description: optionalInput(trimmedTextSchema.max(1000)),
});

export const updateShopSchema = createShopSchema.partial().extend({
  name: optionalInput(createShopSchema.shape.name),
  status: optionalInput(z.enum(ShopStatus)),
});

export type CreateShopInput = z.output<typeof createShopSchema>;
export type UpdateShopInput = z.output<typeof updateShopSchema>;

export const inviteSchema = z.strictObject({
  email: z.email().trim().toLowerCase(),
  roleIds: z.array(uuidSchema),
});

export type InviteShopMemberInput = z.output<typeof inviteSchema>;
