import z from 'zod';

import { paginationQuerySchema } from '@/common/pagination';

import { UserRole, UserStatus } from '../enums';

export const USER_SORT_FIELDS = ['createdAt', 'email', 'fullName'] as const;

export const findUserSchema = paginationQuerySchema.extend({
  sortBy: z.string().trim().pipe(z.enum(USER_SORT_FIELDS)).optional(),
  role: z.enum(UserRole).optional(),
  status: z.enum(UserStatus).optional(),
});

export type FindUserQuery = z.infer<typeof findUserSchema>;
