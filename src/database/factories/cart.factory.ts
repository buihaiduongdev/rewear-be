import type { DeepPartial } from 'typeorm';

import { Cart } from '@/modules/cart/entities';

import { BaseFactory } from './base.factory';

export class CartFactory extends BaseFactory<Cart> {
  definition(): DeepPartial<Cart> {
    return {};
  }
}
