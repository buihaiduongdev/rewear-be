import z from 'zod';

export const databaseSchema = z.object({
  url: z.url().optional(),
  type: z.literal('postgres').default('postgres'),
  host: z.string().min(1).default('localhost'),
  port: z.coerce.number().int().min(1).max(65535).default(5432),
  username: z.string().min(1).default('postgres'),
  password: z.string().default('postgres'),
  database: z.string().min(1).default('rewear'),
});

export type TDatabaseConfig = z.infer<typeof databaseSchema>;
