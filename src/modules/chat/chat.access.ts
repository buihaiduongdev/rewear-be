import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { SHOP_PERMISSIONS } from '@/modules/authorization/constants';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserStatus } from '@/modules/user/enums';

import { CHAT_SIDE } from './constants/chat.constant';
import { ChatConversation } from './entities/chat.entity';

@Injectable()
export class ChatAccess {
  constructor(private readonly authorization: AuthorizationService) {}
  async active(manager: EntityManager, userId: string) {
    const user = await manager.findOneBy(User, {
      id: userId,
      status: UserStatus.ACTIVE,
    });
    if (!user) throw new ForbiddenException('Active chat participant required');
    return user;
  }
  async side(manager: EntityManager, userId: string, row: ChatConversation) {
    await this.active(manager, userId);
    if (row.buyerId === userId) return CHAT_SIDE.BUYER;
    if (
      await this.authorization.hasPermission(
        userId,
        row.shopId,
        SHOP_PERMISSIONS.CHAT_MANAGE,
        manager,
      )
    )
      return CHAT_SIDE.SHOP;
    throw new ForbiddenException('Chat access denied');
  }
  async load(manager: EntityManager, userId: string, id: string, lock = false) {
    const row = await manager.findOne(ChatConversation, {
      where: { id },
      lock: lock ? { mode: 'pessimistic_write' } : undefined,
    });
    if (!row) throw new NotFoundException('Conversation not found');
    const side = await this.side(manager, userId, row);
    return { row, side };
  }
  async activeShop(manager: EntityManager, shopId: string) {
    if (
      !(await manager.existsBy(Shop, { id: shopId, status: ShopStatus.ACTIVE }))
    )
      throw new ForbiddenException('Shop is not accepting new chat messages');
  }
  async canManage(manager: EntityManager, userId: string, shopId: string) {
    return this.authorization.hasPermission(
      userId,
      shopId,
      SHOP_PERMISSIONS.CHAT_MANAGE,
      manager,
    );
  }
}
