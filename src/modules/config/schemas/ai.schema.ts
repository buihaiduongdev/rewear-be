import z from 'zod';

export const aiSchema = z.object({
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1),
});

export type TAiConfig = z.infer<typeof aiSchema>;
