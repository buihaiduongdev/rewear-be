import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { GHN_SHIPMENT_STATUS } from '@/infrastructure/shipping/constants/ghn-shipment.constant';
import {
  ORDER_CANCEL_STATE,
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import { Order, OrderEvent } from '@/modules/order/entities';
import { OrderService } from '@/modules/order/order.service';

import { SHIPMENT_REVIEW_REASON } from './constants/shipment.constant';
import { UNSAFE_CARRIER_REVIEW_REASONS } from './constants/shipment.constant';
import { ShipmentReturnInspection } from './entities/shipment-return-inspection.entity';
import { Shipment } from './entities/shipment.entity';
import {
  type ReturnInspectionInput,
  returnInspectionSchema,
} from './schemas/return-inspection.schema';

@Injectable()
export class ShipmentReturnInspectionService {
  constructor(
    private readonly db: DataSource,
    private readonly orderService: OrderService,
  ) {}

  async inspect(
    userId: string,
    shopId: string,
    id: string,
    input: ReturnInspectionInput,
  ) {
    const decision = returnInspectionSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const order = await manager.findOneOrFail(Order, {
        where: { id, shopId },
        lock: { mode: 'pessimistic_write' },
      });
      const shipment = await manager.findOne(Shipment, {
        where: { orderId: id },
        lock: { mode: 'pessimistic_write' },
      });
      const returnUnverified =
        order.paymentMethod !== ORDER_PAYMENT_METHOD.COD ||
        !order.carrierReturnedAt ||
        shipment?.providerStatus !== GHN_SHIPMENT_STATUS.RETURNED;
      if (returnUnverified)
        throw new ConflictException('Verified uncollected COD return required');
      const adminReconciliationRequired =
        order.cancelState === ORDER_CANCEL_STATE.ADMIN_REVIEW ||
        shipment.codCollectedAt ||
        shipment.carrierTransferredAt ||
        order.deliveryObservedAt ||
        (shipment.reviewReason &&
          UNSAFE_CARRIER_REVIEW_REASONS.includes(shipment.reviewReason));
      if (adminReconciliationRequired) {
        order.cancelState = ORDER_CANCEL_STATE.ADMIN_REVIEW;
        shipment.reviewReason ??=
          SHIPMENT_REVIEW_REASON.RETURN_COLLECTION_REQUIRES_ADMIN_RECONCILIATION;
        await manager.save(order);
        await manager.save(shipment);
        return { order, inspection: null, requiresAdmin: true };
      }
      const existing = await manager.findOneBy(ShipmentReturnInspection, {
        orderId: id,
      });
      if (existing) {
        const inspectionChanged =
          existing.condition !== decision.condition ||
          existing.reason !== decision.reason ||
          existing.evidence !== decision.evidence;
        if (inspectionChanged)
          throw new ConflictException('Returned parcel was already inspected');
        return { order, inspection: existing, requiresAdmin: false };
      }
      if (order.status !== ORDER_STATUS.RETURNS)
        throw new ConflictException('Verified uncollected COD return required');
      return this.recordReturnInspection(
        manager,
        order,
        shipment,
        userId,
        id,
        decision,
      );
    });
  }
  private async recordReturnInspection(
    manager: EntityManager,
    order: Order,
    shipment: Shipment,
    userId: string,
    id: string,
    decision: ReturnInspectionInput,
  ) {
    const [{ now: clock }] = await manager.query(
      'SELECT clock_timestamp() AS now',
    );
    const now = new Date(clock);
    await this.orderService.releaseCodReturnedVerified(
      manager,
      order,
      now,
      decision.condition,
    );
    const inspection = await manager.save(
      ShipmentReturnInspection,
      manager.create(ShipmentReturnInspection, {
        orderId: id,
        actorId: userId,
        ...decision,
        createdAt: now,
      }),
    );
    await manager.save(
      OrderEvent,
      manager.create(OrderEvent, {
        orderId: id,
        action: ORDER_EVENT_ACTION.RETURN_INSPECTED,
        actorId: userId,
        reason: decision.reason,
        evidence: decision.evidence,
        createdAt: now,
      }),
    );
    shipment.reviewReason = order.stockReleaseReviewIds.length
      ? SHIPMENT_REVIEW_REASON.RETURN_STOCK_OWNERSHIP_REQUIRES_REVIEW
      : null;
    await manager.save(shipment);
    return { order, inspection, requiresAdmin: false };
  }
}
