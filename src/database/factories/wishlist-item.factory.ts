import type { DeepPartial } from 'typeorm';

import { WishlistItem } from '@/modules/wishlist/entities';

import { BaseFactory } from './base.factory';

export class WishlistItemFactory extends BaseFactory<WishlistItem> {
  definition(): DeepPartial<WishlistItem> {
    return {};
  }
}
