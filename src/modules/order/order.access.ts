import { Injectable } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import { assertShopOrderManager } from './order.service';

// Compatibility provider kept for frozen `chat` module.
@Injectable()
export class OrderAccess {
  assertManage(
    manager: EntityManager,
    userId: string,
    shopId: string,
    lock = false,
  ): Promise<void> {
    return assertShopOrderManager(manager, userId, shopId, lock);
  }
}
