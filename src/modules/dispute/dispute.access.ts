import { Injectable } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import type { Order } from '@/modules/order/entities';
import { OrderAccess } from '@/modules/order/order.access';

import {
  assertDisputeParty,
  assertDisputeUploadAllowed,
  isDisputeWindowOpen,
  restoreDisputeCaseIfClear,
} from './dispute.service';

// Compatibility provider kept for frozen `chat` module.
@Injectable()
export class DisputeAccess {
  constructor(private readonly orderAccess: OrderAccess) {}

  assertParty(
    manager: EntityManager,
    userId: string,
    orderId: string,
    existingOrder?: Order,
  ) {
    void this.orderAccess;
    return assertDisputeParty(manager, userId, orderId, existingOrder);
  }

  windowOpen(manager: EntityManager, order: Order, now: Date) {
    return isDisputeWindowOpen(manager, order, now);
  }

  assertUploadAllowed(
    manager: EntityManager,
    userId: string,
    orderId: string,
    now: Date,
    existingOrder?: Order,
  ) {
    return assertDisputeUploadAllowed(
      manager,
      userId,
      orderId,
      now,
      existingOrder,
    );
  }
}

export { restoreDisputeCaseIfClear };
