import z from 'zod';

import { optionalInput, uuidSchema } from '@/common/schemas/request.schema';

import { ShopMemberStatus, ShopStatus } from '../enums';

export const createShopSchema = z.strictObject({
  name: z.string().min(1).max(100).regex(/\S/),
  description: optionalInput(z.string().max(1000)),
});

export const updateShopSchema = createShopSchema.partial().extend({
  name: optionalInput(createShopSchema.shape.name),
  status: optionalInput(z.enum(ShopStatus)),
});

export const addShopStaffSchema = z.strictObject({ userId: uuidSchema });
export const updateShopStaffSchema = z.strictObject({
  status: z.enum(ShopMemberStatus),
});

export type CreateShopInput = z.output<typeof createShopSchema>;
export type UpdateShopInput = z.output<typeof updateShopSchema>;
export type AddShopStaffInput = z.output<typeof addShopStaffSchema>;
export type UpdateShopStaffInput = z.output<typeof updateShopStaffSchema>;
