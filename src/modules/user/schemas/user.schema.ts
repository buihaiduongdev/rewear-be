import z from 'zod';

import { paginatedSchema } from '@/common/pagination';
import { dateTimeSchema } from '@/common/schemas';
import { AuthProvider } from '@/modules/auth/enums';
import { ShopMemberRole } from '@/modules/shop/enums';

import { UserRole, UserStatus } from '../enums';

export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  fullName: z.string(),
  provider: z.enum(AuthProvider),
  role: z.enum(UserRole),
  status: z.enum(UserStatus),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const userProfileSchema = userSchema.extend({
  shop: z
    .object({
      id: z.uuid(),
      name: z.string(),
      memberRole: z.enum(ShopMemberRole),
    })
    .nullable(),
});

export const userListSchema = paginatedSchema(userSchema);
