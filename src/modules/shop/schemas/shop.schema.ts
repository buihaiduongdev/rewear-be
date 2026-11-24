import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';

import { ShopMemberRole, ShopStatus } from '../enums';

export const shopSchema = z.object({
  identitySalesPaused: z.boolean().default(false),
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  logoUrl: z.string().nullable().default(null),
  status: z.enum(ShopStatus),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const shopListSchema = z.array(shopSchema);

export const shopMembershipSchema = z.object({
  id: z.uuid(),
  shopId: z.uuid(),
  userId: z.uuid(),
  memberRole: z.enum(ShopMemberRole),
  status: z.string().default('ACTIVE'),
  joinedAt: dateTimeSchema,
  shop: shopSchema,
});

export const shopMembershipListSchema = z.array(shopMembershipSchema);

export const shopMemberRoleItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export const shopMemberSchema = z.object({
  id: z.uuid(),
  shopId: z.uuid(),
  userId: z.uuid(),
  memberRole: z.enum(ShopMemberRole),
  roles: z.array(shopMemberRoleItemSchema),
  joinedAt: dateTimeSchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  user: z.object({
    id: z.uuid(),
    email: z.email(),
    fullName: z.string(),
  }),
});

export const shopMemberListSchema = z.array(shopMemberSchema);
