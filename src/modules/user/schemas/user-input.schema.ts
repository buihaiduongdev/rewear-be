import z from 'zod';

import { optionalInput } from '@/common/schemas/request.schema';
import { registerSchema } from '@/modules/auth/schemas/auth-input.schema';

import { UserRole, UserStatus } from '../enums';

export const createUserSchema = registerSchema.extend({
  role: optionalInput(z.enum(UserRole)),
  status: optionalInput(z.enum(UserStatus)),
});

export const updateUserSchema = createUserSchema.partial().extend({
  email: optionalInput(createUserSchema.shape.email),
  password: optionalInput(createUserSchema.shape.password),
  fullName: optionalInput(createUserSchema.shape.fullName),
});

export const updateProfileSchema = z.strictObject({
  fullName: z.string().min(1).max(255),
});

export type CreateUserInput = z.output<typeof createUserSchema>;
export type UpdateUserInput = z.output<typeof updateUserSchema>;
export type UpdateProfileInput = z.output<typeof updateProfileSchema>;
