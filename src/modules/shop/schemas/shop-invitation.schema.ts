import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';

import { ShopInvitationStatus } from '../enums/shop-invitation-status.enum';

export const shopInvitationSchema = z.object({
  id: z.uuid(),
  shopId: z.uuid(),
  userId: z.uuid(),
  status: z.enum(ShopInvitationStatus),
  expiresAt: dateTimeSchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  roleIds: z.array(z.uuid()),
  user: z
    .object({ id: z.uuid(), email: z.email(), fullName: z.string() })
    .optional(),
  shop: z.object({ id: z.uuid(), name: z.string() }).optional(),
});
export const shopInvitationListSchema = z.array(shopInvitationSchema);
export const acceptedShopMemberSchema = z.object({
  id: z.uuid(),
  shopId: z.uuid(),
  userId: z.uuid(),
  memberRole: z.string(),
  joinedAt: dateTimeSchema,
});
