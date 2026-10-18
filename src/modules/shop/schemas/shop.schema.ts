import z from 'zod';

import { ShopMemberRole, ShopMemberStatus, ShopStatus } from '../enums';

export const shopSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(ShopStatus),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const shopListSchema = z.array(shopSchema);

export const shopMembershipSchema = z.object({
  id: z.uuid(),
  shopId: z.uuid(),
  userId: z.uuid(),
  memberRole: z.enum(ShopMemberRole),
  status: z.enum(ShopMemberStatus),
  joinedAt: z.coerce.date(),
  shop: shopSchema,
});

export const shopMembershipListSchema = z.array(shopMembershipSchema);

export const shopMemberSchema = z.object({
  id: z.uuid(),
  shopId: z.uuid(),
  userId: z.uuid(),
  memberRole: z.enum(ShopMemberRole),
  status: z.enum(ShopMemberStatus),
  joinedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  user: z.object({
    id: z.uuid(),
    email: z.email(),
    fullName: z.string(),
  }),
});

export const shopMemberListSchema = z.array(shopMemberSchema);
