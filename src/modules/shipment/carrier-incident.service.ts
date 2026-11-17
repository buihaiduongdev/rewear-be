import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import {
  ORDER_CANCEL_STATE,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities/order.entity';
import { OrderService } from '@/modules/order/order.service';

import { FULFILLMENT_POLICY } from './constants/fulfillment.constant';
import {
  CARRIER_INCIDENT_OUTCOME,
  CARRIER_INCIDENT_STATE,
  SHIPMENT_REVIEW_REASON,
  SHIPMENT_STATE,
} from './constants/shipment.constant';
import { CarrierIncident } from './entities/carrier-incident.entity';
import { Shipment } from './entities/shipment.entity';
import type { CarrierIncidentDecision } from './types/shipment.type';
import type { FulfillmentListInput } from './types/shipment.type';
import { fulfillmentDeadline } from './utils/fulfillment-calendar';

@Injectable()
export class CarrierIncidentService {
  constructor(
    private readonly db: DataSource,
    private readonly orderService: OrderService,
  ) {}
  incidents(input: FulfillmentListInput = {}): Promise<CarrierIncident[]> {
    return this.db.getRepository(CarrierIncident).find({
      where: { state: CARRIER_INCIDENT_STATE.REVIEW },
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
      if (incident.state === CARRIER_INCIDENT_STATE.RESOLVED)
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
      if (input.outcome === CARRIER_INCIDENT_OUTCOME.CANCELLED_BEFORE_PICKUP) {
        const carrierStateUnsafe =
          shipment.state !== SHIPMENT_STATE.CANCEL_PENDING ||
          shipment.pickedObservedAt ||
          shipment.codCollectedAt ||
          shipment.carrierTransferredAt;
        const orderFulfillmentObserved =
          order.deliveryObservedAt || order.carrierReturnedAt;
        const approvedCodCancellationMissing =
          order.paymentMethod !== ORDER_PAYMENT_METHOD.COD ||
          order.status !== ORDER_STATUS.PREPARING ||
          order.cancelState !== ORDER_CANCEL_STATE.APPROVED;
        const cancellationUnsafe =
          carrierStateUnsafe ||
          orderFulfillmentObserved ||
          approvedCodCancellationMissing;
        if (cancellationUnsafe) {
          throw new ConflictException(
            'Cancellation requires approved COD order and safe carrier state',
          );
        }
        await this.orderService.cancelCodVerified(manager, order, now);
        shipment.state = SHIPMENT_STATE.CANCELLED;
        shipment.nextQueryAt = null;
        shipment.reviewReason =
          SHIPMENT_REVIEW_REASON.ADMIN_CONFIRMED_CANCELLATION;
        await manager.save(shipment);
        incident.state = CARRIER_INCIDENT_STATE.RESOLVED;
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
      await this.openCancellationIncidents(manager, now);
      await this.refreshPendingIncidents(manager, now);
    });
  }
  private async openCancellationIncidents(manager: EntityManager, now: Date) {
    const shipments = await manager
      .createQueryBuilder(Shipment, 'shipment')
      .where('shipment.state = :state', {
        state: SHIPMENT_STATE.CANCEL_PENDING,
      })
      .andWhere('shipment.cancelRequestedAt <= :cutoff', {
        cutoff: new Date(
          now.getTime() - FULFILLMENT_POLICY.UNKNOWN_ESCALATION_MS,
        ),
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
        shipment.cancelRequestedAt!.getTime() +
          FULFILLMENT_POLICY.UNKNOWN_ESCALATION_MS,
      );
      const reviewDueAt = await fulfillmentDeadline(
        manager,
        openedAt,
        FULFILLMENT_POLICY.CANCELLATION_ADMIN_BUSINESS_DAYS,
      );
      await manager.save(CarrierIncident, {
        shipmentId: shipment.id,
        state: CARRIER_INCIDENT_STATE.REVIEW,
        openedAt,
        reviewDueAt,
        calendarMissing: reviewDueAt === null,
        overdue: reviewDueAt !== null && reviewDueAt <= now,
        events: [],
      });
    }
  }

  private async refreshPendingIncidents(manager: EntityManager, now: Date) {
    const pending = await manager.find(CarrierIncident, {
      where: { state: CARRIER_INCIDENT_STATE.REVIEW },
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
      const cancellationVerified =
        shipment.state === SHIPMENT_STATE.CANCELLED &&
        order.status === ORDER_STATUS.CANCELLED;
      if (cancellationVerified) {
        incident.state = CARRIER_INCIDENT_STATE.RESOLVED;
      }
      if (incident.calendarMissing) {
        incident.reviewDueAt = await fulfillmentDeadline(
          manager,
          incident.openedAt,
          FULFILLMENT_POLICY.CANCELLATION_ADMIN_BUSINESS_DAYS,
        );
        incident.calendarMissing = incident.reviewDueAt === null;
      }
      const reviewExpired = incident.reviewDueAt && incident.reviewDueAt <= now;
      if (reviewExpired) incident.overdue = true;
      incident.updatedAt = now;
      await manager.save(incident);
    }
  }
}
