import { faker } from '@faker-js/faker';
import type { DeepPartial } from 'typeorm';

import { MediaLink } from '@/modules/media/entities';
import { MediaOwnerType, MediaRole } from '@/modules/media/enums';

import { BaseFactory } from './base.factory';

export class MediaLinkFactory extends BaseFactory<MediaLink> {
  definition(): DeepPartial<MediaLink> {
    return {
      mediaId: faker.string.uuid(),
      ownerType: MediaOwnerType.PRODUCT,
      ownerId: faker.string.uuid(),
      role: MediaRole.COVER,
      angle: 'FRONT',
      sortOrder: 0,
    };
  }
}
