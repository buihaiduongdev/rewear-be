import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import {
  ORDER_CANCEL_STATE,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/order.constants';
import { Order } from '@/modules/order/order.entity';
import { OrderService } from '@/modules/order/order.service';

import { CarrierIncident } from './carrier-incident.entity';
import { fulfillmentDeadline } from './fulfillment-calendar';
import type { CarrierIncidentDecision } from './schemas/carrier-incident.schema';
import type { FulfillmentListInput } from './schemas/fulfillment-list.schema';
import { Shipment } from './shipment.entity';

@Injectable()
export class CarrierIncidentService {
  constructor(
    private readonly db: DataSource,
    private readonly orders: OrderService,
  ) {}
  incidents(input: FulfillmentListInput = {}): Promise<CarrierIncident[]> {
    return this.db.getRepository(CarrierIncident).find({
      where: { state: 'REVIEW' },
      order: { openedAt: 'ASC', id: 'ASC' },
      skip: input.offset ?? 0,
      take: 100,
    });
  }
  async decide(
    adminId: string,
    id: string,
    input: CarrierIncidentDecision,
  ): Promise<CarrierIncident> {
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const incident = await manager.findOneByOrFail(CarrierIncident, { id });
      if (incident.state === 'RESOLVED')
        throw new ConflictException('Carrier incident is already resolved');
      const shipment = await manager.findOneByOrFail(Shipment, {
        id: incident.shipmentId,
      });
      const order = await manager.findOneByOrFail(Order, {
        id: shipment.orderId,
      });
      const [{ now: timestamp }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(timestamp);
      if (input.outcome === 'CANCELLED_BEFORE_PICKUP') {
        if (
          shipment.state !== 'CANCEL_PENDING' ||
          shipment.pickedObservedAt ||
          shipment.codCollectedAt ||
          shipment.carrierTransferredAt ||
          order.deliveryObservedAt ||
          order.carrierReturnedAt ||
          order.paymentMethod !== ORDER_PAYMENT_METHOD.COD ||
          order.status !== ORDER_STATUS.PREPARING ||
          order.cancelState !== ORDER_CANCEL_STATE.APPROVED
        ) {
          throw new ConflictException(
            'Cancellation requires approved COD order and safe carrier state',
          );
        }
        await this.orders.cancelCodVerified(manager, order, now);
        shipment.state = 'CANCELLED';
        shipment.nextQueryAt = null;
        shipment.reviewReason = 'ADMIN_CONFIRMED_CANCELLATION';
        await manager.save(shipment);
        incident.state = 'RESOLVED';
      }
      incident.events = [
        ...incident.events,
        { ...input, actorId: adminId, at: now.toISOString() },
      ];
      return manager.save(incident);
    });
  }
  async run(): Promise<void> {
    await this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const [{ now: timestamp }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(timestamp);
      const shipments = await manager
        .createQueryBuilder(Shipment, 'shipment')
        .where('shipment.state = :state', { state: 'CANCEL_PENDING' })
        .andWhere('shipment.cancelRequestedAt <= :cutoff', {
          cutoff: new Date(now.getTime() - 1800000),
        })
        .andWhere((query) => {
          const existing = query
            .subQuery()
            .select('1')
            .from(CarrierIncident, 'existing')
            .where('existing.shipmentId = shipment.id')
            .getQuery();
          return `NOT EXISTS ${existing}`;
        })
        .orderBy('shipment.cancelRequestedAt', 'ASC')
        .addOrderBy('shipment.id', 'ASC')
        .take(100)
        .getMany();
      for (const shipment of shipments) {
        const existing = await manager.findOneBy(CarrierIncident, {
          shipmentId: shipment.id,
        });
        if (existing) continue;
        const openedAt = new Date(
          shipment.cancelRequestedAt!.getTime() + 1800000,
        );
        const reviewDueAt = await fulfillmentDeadline(manager, openedAt, 1);
        await manager.save(CarrierIncident, {
          shipmentId: shipment.id,
          state: 'REVIEW',
          openedAt,
          reviewDueAt,
          calendarMissing: reviewDueAt === null,
          overdue: reviewDueAt !== null && reviewDueAt <= now,
          events: [],
        });
      }
      const pending = await manager.find(CarrierIncident, {
        where: { state: 'REVIEW' },
        order: { updatedAt: 'ASC', id: 'ASC' },
        take: 100,
      });
      for (const incident of pending) {
        const shipment = await manager.findOneByOrFail(Shipment, {
          id: incident.shipmentId,
        });
        const order = await manager.findOneByOrFail(Order, {
          id: shipment.orderId,
        });
        if (
          shipment.state === 'CANCELLED' &&
          order.status === ORDER_STATUS.CANCELLED
        ) {
          incident.state = 'RESOLVED';
        }
        if (incident.calendarMissing) {
          incident.reviewDueAt = await fulfillmentDeadline(
            manager,
            incident.openedAt,
            1,
          );
          incident.calendarMissing = incident.reviewDueAt === null;
        }
        if (incident.reviewDueAt && incident.reviewDueAt <= now)
          incident.overdue = true;
        incident.updatedAt = now;
        await manager.save(incident);
      }
    });
  }
}
