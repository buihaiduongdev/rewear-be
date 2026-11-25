import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import 'dotenv/config';

import { SEED_CATEGORIES } from './catalog';

async function uploadSeedImages() {
  const {
    STORAGE_ENDPOINT,
    STORAGE_ACCESS_KEY_ID,
    STORAGE_SECRET_ACCESS_KEY,
    STORAGE_BUCKET,
  } = process.env;
  if (
    !STORAGE_ENDPOINT ||
    !STORAGE_ACCESS_KEY_ID ||
    !STORAGE_SECRET_ACCESS_KEY ||
    !STORAGE_BUCKET
  )
    throw new Error('Storage configuration is required to upload seed images');
  const client = new S3Client({
    region: process.env.STORAGE_REGION || 'auto',
    endpoint: STORAGE_ENDPOINT,
    credentials: {
      accessKeyId: STORAGE_ACCESS_KEY_ID,
      secretAccessKey: STORAGE_SECRET_ACCESS_KEY,
    },
  });
  const images = new Map<string, Uint8Array>();
  for (const { photo } of SEED_CATEGORIES) {
    const response = await fetch(
      `https://images.unsplash.com/${photo}?w=800&fit=crop&q=80&fm=jpg`,
    );
    if (
      !response.ok ||
      !response.headers.get('content-type')?.startsWith('image/')
    )
      throw new Error(
        `Cannot download seed image ${photo}: HTTP ${response.status}`,
      );
    images.set(photo, new Uint8Array(await response.arrayBuffer()));
  }
  const keys = Array.from({ length: 36 }, (_, index) => {
    const { photo } = SEED_CATEGORIES[index % SEED_CATEGORIES.length];
    return { photo, key: `seed/products/${photo}-${index}.jpg` };
  });
  for (const [index, status] of [
    [0, 'pending'],
    [1, 'pending'],
    [2, 'pending'],
    [0, 'preparing'],
    [1, 'shipping'],
    [2, 'delivered'],
  ] as const) {
    const { photo } = SEED_CATEGORIES[index];
    keys.push({
      photo,
      key: `seed/products/${photo}-order-${index}-${status}.jpg`,
    });
  }
  for (const { photo, key } of keys) {
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: STORAGE_BUCKET,
          Key: key,
          Body: images.get(photo)!,
          ContentType: 'image/jpeg',
          IfNoneMatch: '*',
        }),
      );
    } catch (error) {
      if (
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode !== 412
      )
        throw error;
    }
  }
  console.log(`Ensured ${keys.length} seed images in the public bucket.`);
}

uploadSeedImages().catch((error: unknown) => {
  console.error('Failed to upload seed images:', error);
  process.exitCode = 1;
});
