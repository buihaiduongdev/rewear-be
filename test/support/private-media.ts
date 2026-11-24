import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { Media } from '@/modules/media/entities';
import { MediaType } from '@/modules/media/enums';

export function createPrivateMedia(db: DataSource, uploadedById: string) {
  return db.getRepository(Media).save({
    uploadedById,
    storageKey: `test/private/${randomUUID()}`,
    url: null,
    visibility: 'private',
    mediaType: MediaType.IMAGE,
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
    retiredAt: null,
    isAttached: true,
  });
}
