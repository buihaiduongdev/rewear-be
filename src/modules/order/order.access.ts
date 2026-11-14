import { ForbiddenException, Injectable } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole, ShopMemberStatus } from '@/modules/shop/enums';

@Injectable()
export class OrderAccess {
  async assertManage(
    manager: EntityManager,
    userId: string,
    shopId: string,
    lock = false,
  ) {
    // The current Shop module has no configurable permission resolver yet.
    // Do not grant every STAFF access merely because they belong to the Shop.
    const membership = await manager.findOne(ShopMember, {
      where: {
        shopId,
        userId,
        memberRole: ShopMemberRole.OWNER,
        status: ShopMemberStatus.ACTIVE,
      },
      ...(lock ? { lock: { mode: 'pessimistic_read' as const } } : {}),
    });
    if (!membership)
      throw new ForbiddenException('Shop order management access required');
  }
}
