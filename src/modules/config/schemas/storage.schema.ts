import z from 'zod';

export const storageSchema = z.object({
  region: z.string().min(1),
  endpoint: z.url(),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  bucket: z.string().min(1),
  publicBaseUrl: z.url(),
  expiresIn: z.coerce.number().int().positive(),
});

export type TStorageConfig = z.infer<typeof storageSchema>;
