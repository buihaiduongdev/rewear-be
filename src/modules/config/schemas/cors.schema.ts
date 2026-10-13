import z from 'zod';

export const corsSchema = z.object({
  origin: z.string().default('http://localhost:5000'),
});

export type TCorsConfig = z.infer<typeof corsSchema>;
