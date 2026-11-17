import z from 'zod';

import { uuidSchema } from '@/common/schemas/request.schema';

import { ASSIGNABLE_SHOP_PERMISSION_KEYS } from '../constants';

const permissionsSchema = z.array(z.enum(ASSIGNABLE_SHOP_PERMISSION_KEYS));
export const createRoleSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  permissions: permissionsSchema,
});
export const updateRoleSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(80).optional(),
    permissions: permissionsSchema.optional(),
  })
  .refine(
    (input) => input.name !== undefined || input.permissions !== undefined,
    'Provide a name or permissions',
  );
export const assignRolesSchema = z.strictObject({
  roleIds: z.array(uuidSchema),
});

export type CreateRoleInput = z.output<typeof createRoleSchema>;
export type UpdateRoleInput = z.output<typeof updateRoleSchema>;
export type AssignRolesInput = z.output<typeof assignRolesSchema>;
