import { faker } from '@faker-js/faker';
import type { DeepPartial } from 'typeorm';

import { ProductModeration } from '@/modules/product/entities';
import { ProductModerationStatus } from '@/modules/product/enums';

import { BaseFactory } from './base.factory';

export class ProductModerationFactory extends BaseFactory<ProductModeration> {
  definition(): DeepPartial<ProductModeration> {
    return {
      productId: faker.string.uuid(),
      status: ProductModerationStatus.APPROVED,
      version: 1,
      reason: null,
    };
  }
}
