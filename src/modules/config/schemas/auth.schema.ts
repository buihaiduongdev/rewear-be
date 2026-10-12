import z from 'zod';

export const authSchema = z.object({
  accessSecret: z.string().min(32),
  accessExpiresIn: z.string().min(1).default('15m'),
  refreshSecret: z.string().min(32),
  refreshExpiresIn: z.string().min(1).default('30d'),
  googleClientId: z.string().min(1),
});

export type TAuthConfig = z.infer<typeof authSchema>;
