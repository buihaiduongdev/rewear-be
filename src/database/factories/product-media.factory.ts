import { faker } from '@faker-js/faker';
import type { DeepPartial } from 'typeorm';

import { ProductMedia } from '@/modules/media/entities';
import { MediaRole } from '@/modules/media/enums';

import { BaseFactory } from './base.factory';

export class ProductMediaFactory extends BaseFactory<ProductMedia> {
  definition(): DeepPartial<ProductMedia> {
    return {
      mediaId: faker.string.uuid(),
      productId: faker.string.uuid(),
      role: MediaRole.COVER,
      angle: 'FRONT',
      sortOrder: 0,
    };
  }
}
