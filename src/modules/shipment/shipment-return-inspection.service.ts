import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { OrderAccess } from '@/modules/order/order.access';
import {
  ORDER_CANCEL_STATE,
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/order.constants';
import { Order, OrderEvent } from '@/modules/order/order.entity';
import { OrderService } from '@/modules/order/order.service';

import {
  type ReturnInspectionInput,
  returnInspectionSchema,
} from './schemas/return-inspection.schema';
import { ShipmentReturnInspection } from './shipment-return-inspection.entity';
import { UNSAFE_CARRIER_REVIEW_REASONS } from './shipment.constants';
import { Shipment } from './shipment.entity';

@Injectable()
export class ShipmentReturnInspectionService {
  constructor(
    private readonly db: DataSource,
    private readonly access: OrderAccess,
    private readonly orders: OrderService,
  ) {}

  async inspect(
    userId: string,
    shopId: string,
    id: string,
    input: ReturnInspectionInput,
  ) {
    const decision = returnInspectionSchema.parse(input);
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      await this.access.assertManage(manager, userId, shopId, true);
      const order = await manager.findOneOrFail(Order, {
        where: { id, shopId },
        lock: { mode: 'pessimistic_write' },
      });
      const shipment = await manager.findOne(Shipment, {
        where: { orderId: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        order.paymentMethod !== ORDER_PAYMENT_METHOD.COD ||
        !order.carrierReturnedAt ||
        shipment?.providerStatus !== 'returned'
      )
        throw new ConflictException('Verified uncollected COD return required');
      if (
        order.cancelState === ORDER_CANCEL_STATE.ADMIN_REVIEW ||
        shipment.codCollectedAt ||
        shipment.carrierTransferredAt ||
        order.deliveryObservedAt ||
        (shipment.reviewReason &&
          UNSAFE_CARRIER_REVIEW_REASONS.includes(shipment.reviewReason))
      ) {
        order.cancelState = ORDER_CANCEL_STATE.ADMIN_REVIEW;
        shipment.reviewReason ??=
          'RETURN_COLLECTION_REQUIRES_ADMIN_RECONCILIATION';
        await manager.save(order);
        await manager.save(shipment);
        return { order, inspection: null, requiresAdmin: true };
      }
      const existing = await manager.findOneBy(ShipmentReturnInspection, {
        orderId: id,
      });
      if (existing) {
        if (
          existing.condition !== decision.condition ||
          existing.reason !== decision.reason ||
          existing.evidence !== decision.evidence
        )
          throw new ConflictException('Returned parcel was already inspected');
        return { order, inspection: existing, requiresAdmin: false };
      }
      if (order.status !== ORDER_STATUS.RETURNS)
        throw new ConflictException('Verified uncollected COD return required');
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      await this.orders.releaseCodReturnedVerified(
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
        ? 'RETURN_STOCK_OWNERSHIP_REQUIRES_REVIEW'
        : null;
      await manager.save(shipment);
      return { order, inspection, requiresAdmin: false };
    });
  }
}
