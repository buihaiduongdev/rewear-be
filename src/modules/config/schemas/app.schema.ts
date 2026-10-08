import z from 'zod';

export const appSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().int().min(1).max(65535).default(3001),
});

export type TAppConfig = z.infer<typeof appSchema>;
