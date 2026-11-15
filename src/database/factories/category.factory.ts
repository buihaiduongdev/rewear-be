import { faker } from '@faker-js/faker';
import type { DeepPartial } from 'typeorm';

import { Category } from '@/modules/category/entities';

import { BaseFactory } from './base.factory';

export class CategoryFactory extends BaseFactory<Category> {
  definition(): DeepPartial<Category> {
    const name = faker.commerce.department();
    return {
      name,
      slug: faker.string.uuid(),
      requiredMeasurements: [],
      isActive: true,
    };
  }
}
