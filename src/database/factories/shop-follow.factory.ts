import type { DeepPartial } from 'typeorm';

import { ShopFollow } from '@/modules/shop-follows/entities/shop-follow.entity';

import { BaseFactory } from './base.factory';

export class ShopFollowFactory extends BaseFactory<ShopFollow> {
  definition(): DeepPartial<ShopFollow> {
    return {};
  }
}
