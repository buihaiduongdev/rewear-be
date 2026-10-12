import z from 'zod';

import { paginatedSchema } from '@/common/pagination';
import { AuthProvider } from '@/modules/auth/enums';

import { UserRole, UserStatus } from '../enums';

export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  fullName: z.string(),
  provider: z.enum(AuthProvider),
  role: z.enum(UserRole),
  status: z.enum(UserStatus),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const userListSchema = paginatedSchema(userSchema);
