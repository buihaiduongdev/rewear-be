import { faker } from '@faker-js/faker';
import type { DeepPartial } from 'typeorm';

import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';

import { BaseFactory } from './base.factory';

export class ShopFactory extends BaseFactory<Shop> {
  definition(): DeepPartial<Shop> {
    return {
      name: faker.company.name(),
      description: faker.company.catchPhrase(),
      status: ShopStatus.ACTIVE,
    };
  }
}
