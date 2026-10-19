import z from 'zod';

const DEFAULT_ALLOWED_TYPES = 'image/jpeg,image/png,image/webp,image/avif';

export const storageSchema = z.object({
  region: z.string().min(1).default('auto'),
  endpoint: z.url(),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  bucket: z.string().min(1),
  publicBaseUrl: z.url().transform((value) => value.replace(/\/+$/, '')),
  maxSizeBytes: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  uploadExpiresInSeconds: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(900),
  allowedTypes: z
    .string()
    .default(DEFAULT_ALLOWED_TYPES)
    .transform((value) =>
      value
        .split(',')
        .map((type) => type.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().min(1)).min(1)),
});

export type TStorageConfig = z.infer<typeof storageSchema>;
