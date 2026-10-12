import z from 'zod';

import { userSchema } from '@/modules/user/schemas';

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userSchema.pick({ id: true, email: true, fullName: true, role: true }),
});

export const messageSchema = z.object({ message: z.string() });
