import type { DeepPartial } from 'typeorm';

import { CartItem } from '@/modules/cart/entities';

import { BaseFactory } from './base.factory';

export class CartItemFactory extends BaseFactory<CartItem> {
  definition(): DeepPartial<CartItem> {
    return {};
  }
}
