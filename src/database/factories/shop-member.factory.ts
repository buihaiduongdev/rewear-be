import { faker } from '@faker-js/faker';
import type { DeepPartial } from 'typeorm';

import { ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole, ShopMemberStatus } from '@/modules/shop/enums';

import { BaseFactory } from './base.factory';

export class ShopMemberFactory extends BaseFactory<ShopMember> {
  definition(): DeepPartial<ShopMember> {
    return {
      shopId: faker.string.uuid(),
      userId: faker.string.uuid(),
      memberRole: ShopMemberRole.OWNER,
      status: ShopMemberStatus.ACTIVE,
    };
  }
}
