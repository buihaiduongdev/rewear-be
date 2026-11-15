import { Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { GHN_SHIPMENT_STATUS } from '@/infrastructure/shipping/ghn-shipment.constants';
import {
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/order.constants';

import { fulfillmentDeadline } from './fulfillment-calendar';
import { FULFILLMENT_POLICY } from './fulfillment.constants';
import { ShipmentReturnInspection } from './shipment-return-inspection.entity';
import { SHIPMENT_REVIEW_REASON } from './shipment.constants';
import { Shipment } from './shipment.entity';

@Injectable()
export class ReturnInspectionDeadlineService {
  constructor(private readonly db: DataSource) {}

  async run(): Promise<void> {
    await this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const [{ now: timestamp }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(timestamp);
      const shipments = await manager
        .createQueryBuilder(Shipment, 'shipment')
        .innerJoinAndSelect('shipment.order', 'order')
        .where('order.paymentMethod = :method', {
          method: ORDER_PAYMENT_METHOD.COD,
        })
        .andWhere('order.status = :status', { status: ORDER_STATUS.RETURNS })
        .andWhere('order.carrierReturnedAt IS NOT NULL')
        .andWhere('shipment.providerStatus = :providerStatus', {
          providerStatus: GHN_SHIPMENT_STATUS.RETURNED,
        })
        .andWhere((query) => {
          const inspection = query
            .subQuery()
            .select('1')
            .from(ShipmentReturnInspection, 'inspection')
            .where('inspection.orderId = shipment.orderId')
            .getQuery();
          return `NOT EXISTS ${inspection}`;
        })
        .orderBy('shipment.updatedAt', 'ASC')
        .addOrderBy('shipment.id', 'ASC')
        .take(100)
        .getMany();
      for (const shipment of shipments) {
        if (!shipment.returnInspectionBy) {
          shipment.returnInspectionBy = await fulfillmentDeadline(
            manager,
            shipment.order.carrierReturnedAt!,
            FULFILLMENT_POLICY.RETURN_INSPECTION_BUSINESS_DAYS,
          );
          shipment.returnInspectionCalendarMissing =
            shipment.returnInspectionBy === null;
        }
        if (shipment.returnInspectionBy && shipment.returnInspectionBy <= now) {
          shipment.returnInspectionOverdue = true;
          shipment.reviewReason ??=
            SHIPMENT_REVIEW_REASON.RETURN_INSPECTION_OVERDUE;
        }
        shipment.updatedAt = now;
        await manager.save(shipment);
      }
    });
  }
}
