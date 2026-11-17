import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';

export const shopRoleSchema = z.object({
  id: z.uuid(),
  shopId: z.uuid(),
  name: z.string(),
  isDefault: z.boolean(),
  permissions: z.array(z.string()),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export const shopRoleListSchema = z.array(shopRoleSchema);
export const shopRoleItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export const shopRoleAssignmentSchema = z.object({
  memberId: z.uuid(),
  roles: z.array(shopRoleItemSchema),
});

export const shopAccessSchema = z.object({
  isOwner: z.boolean(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});
export const shopPermissionListSchema = z.array(z.string());
