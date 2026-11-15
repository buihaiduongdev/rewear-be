import { faker } from '@faker-js/faker';
import type { DeepPartial } from 'typeorm';

import { Product } from '@/modules/product/entities';
import { ProductCondition, ProductStatus } from '@/modules/product/enums';

import { BaseFactory } from './base.factory';

export class ProductFactory extends BaseFactory<Product> {
  definition(): DeepPartial<Product> {
    return {
      categoryId: faker.string.uuid(),
      shopId: faker.string.uuid(),
      title: faker.commerce.productName(),
      description: faker.commerce.productDescription(),
      condition: ProductCondition.GOOD,
      size: 'M',
      color: 'Black',
      brand: 'Vintage',
      price: 200000,
      measurements: {
        chest: 96,
        waist: 76,
        hip: 98,
        length: 68,
        shoulder: 42,
        sleeve: 58,
        inseam: 74,
      },
      repairs: null,
      defects: [],
      status: ProductStatus.ACTIVE,
      publishedAt: new Date(),
      heldUntil: null,
      soldAt: null,
    };
  }
}
