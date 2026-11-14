import { ForbiddenException, Injectable } from '@nestjs/common';

import { EntityManager, EntityNotFoundError } from 'typeorm';

import { ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole, ShopMemberStatus } from '@/modules/shop/enums';

@Injectable()
export class OrderAccess {
  async assertManage(
    manager: EntityManager,
    userId: string,
    shopId: string,
    lock = false,
  ): Promise<void> {
    // The current Shop module has no configurable permission resolver yet.
    // Do not grant every STAFF access merely because they belong to the Shop.
    try {
      await manager.findOneOrFail(ShopMember, {
        where: {
          shopId,
          userId,
          memberRole: ShopMemberRole.OWNER,
          status: ShopMemberStatus.ACTIVE,
        },
        lock: lock ? { mode: 'pessimistic_read' } : undefined,
      });
    } catch (error) {
      if (error instanceof EntityNotFoundError)
        throw new ForbiddenException('Shop order management access required');
      throw error;
    }
  }
}
