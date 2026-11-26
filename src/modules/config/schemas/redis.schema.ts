import z from 'zod';

export const redisSchema = z.object({
  host: z.string().min(1).default('127.0.0.1'),
  port: z.coerce.number().int().min(1).max(65535).default(6379),
  password: z.string().min(1).optional(),
});

export type TRedisConfig = z.infer<typeof redisSchema>;
