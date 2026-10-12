import z from 'zod';

export const mailSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().min(1),
  password: z.string().min(1),
  from: z.string().min(1),
  frontendUrl: z.url(),
});

export type TMailConfig = z.infer<typeof mailSchema>;
