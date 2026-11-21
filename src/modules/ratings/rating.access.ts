import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { Order } from '@/modules/order/entities/order.entity';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { hasDeliveryProof } from './rating.policy';

@Injectable()
export class RatingAccess {
  constructor(private readonly authorization: AuthorizationService) {}
  async activeUser(manager: EntityManager, userId: string) {
    const user = await manager.findOneBy(User, {
      id: userId,
      status: UserStatus.ACTIVE,
    });
    if (!user) throw new ForbiddenException('Active user required');
    return user;
  }
  async eligible(
    manager: EntityManager,
    buyerId: string,
    orderId: string,
    now: Date,
  ) {
    await this.activeUser(manager, buyerId);
    const order = await manager.findOneBy(Order, { id: orderId, buyerId });
    if (!order) throw new NotFoundException('Order not found');
    const proof = await manager.findOneBy(OrderDeliveryVerification, {
      orderId,
    });
    if (!hasDeliveryProof(order, proof, now))
      throw new ForbiddenException('Verified delivery required to rate Shop');
    return { order, proof: proof! };
  }
  async reply(manager: EntityManager, actorId: string, shopId: string) {
    await this.activeUser(manager, actorId);
    const shop = await manager.findOneBy(Shop, {
      id: shopId,
      status: ShopStatus.ACTIVE,
    });
    if (
      !shop ||
      !(await this.authorization.hasPermission(
        actorId,
        shopId,
        SHOP_PERMISSIONS.RATING_REPLY,
        manager,
      ))
    )
      throw new ForbiddenException('Shop rating reply permission required');
  }
  async admin(manager: EntityManager, actorId: string) {
    const actor = await this.activeUser(manager, actorId);
    if (actor.role !== UserRole.ADMIN)
      throw new ForbiddenException('Admin required');
  }
}
