import { faker } from '@faker-js/faker';
import type { DeepPartial } from 'typeorm';

import { Media } from '@/modules/media/entities';
import { MediaType } from '@/modules/media/enums';

import { BaseFactory } from './base.factory';

export class MediaFactory extends BaseFactory<Media> {
  definition(): DeepPartial<Media> {
    return {
      uploadedById: faker.string.uuid(),
      storageKey: `seed/${faker.string.uuid()}.jpg`,
      url: faker.image.url(),
      mediaType: MediaType.IMAGE,
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      eTag: null,
      retiredAt: null,
    };
  }
}
