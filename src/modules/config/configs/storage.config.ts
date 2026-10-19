import { registerAs } from '@nestjs/config';

import { storageSchema } from '../schemas';

export const storageConfig = registerAs('storage', () =>
  storageSchema.parse({
    region: process.env.STORAGE_REGION,
    endpoint: process.env.STORAGE_ENDPOINT,
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
    bucket: process.env.STORAGE_BUCKET,
    publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL,
    maxSizeBytes: process.env.STORAGE_MAX_SIZE_BYTES,
    uploadExpiresInSeconds: process.env.STORAGE_UPLOAD_EXPIRES_IN_SECONDS,
    allowedTypes: process.env.STORAGE_ALLOWED_TYPES,
  }),
);
