import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import {
  GhnShipmentClient,
  GhnShipmentSnapshot,
} from '@/infrastructure/shipping/ghn-shipment.client';
import { CheckoutOrder } from '@/modules/checkout/entities/checkout-order.entity';
import { quoteInputs } from '@/modules/checkout/shipping-quote.inputs';
import { OrderAccess } from '@/modules/order/order.access';
import {
  ORDER_CANCEL_STATE,
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/order.constants';
import { Order, OrderEvent } from '@/modules/order/order.entity';
import { OrderService } from '@/modules/order/order.service';
import type { OrderCancelState, OrderState } from '@/modules/order/order.type';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';

import type { ShipmentCreateInput } from './schemas/shipment.schema';
import { Shipment } from './shipment.entity';

const inTransit = new Set([
  'picked',
  'storing',
  'sorting',
  'transporting',
  'delivering',
  'money_collect_delivering',
  'delivery_fail',
]);
const returning = new Set([
  'waiting_to_return',
  'return',
  'return_transporting',
  'return_sorting',
  'returning',
  'return_fail',
  'returned',
]);
const bookingBlockedCancelStates: readonly OrderCancelState[] = [
  ORDER_CANCEL_STATE.PENDING,
  ORDER_CANCEL_STATE.APPROVED,
  ORDER_CANCEL_STATE.ADMIN_REVIEW,
  ORDER_CANCEL_STATE.CLOSED,
];
const deliveryTerminalStatuses: readonly OrderState[] = [
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.DISPUTE,
];
const returnTerminalStatuses: readonly OrderState[] = [
  ...deliveryTerminalStatuses,
  ORDER_STATUS.DELIVERED,
];

@Injectable()
export class ShipmentService {
  private readonly logger = new Logger(ShipmentService.name);
  constructor(
    private readonly db: DataSource,
    private readonly access: OrderAccess,
    private readonly orders: OrderService,
    private readonly carrier: GhnShipmentClient,
  ) {}

  private async lock(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
  }
  private async now(manager: EntityManager) {
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }

  private assertBookable(order: Order, now: Date) {
    if (
      order.status !== ORDER_STATUS.PREPARING ||
      (order.cancelState &&
        bookingBlockedCancelStates.includes(order.cancelState)) ||
      (order.cancelState === ORDER_CANCEL_STATE.REJECTED &&
        order.cancelReviewUntil &&
        order.cancelReviewUntil > now)
    )
      throw new ConflictException(
        'Order cannot be booked while cancellation or shipment is in progress',
      );
    if (
      order.paymentMethod === ORDER_PAYMENT_METHOD.COD &&
      (!order.handoverBy ||
        order.handoverBy <= now ||
        order.handoverReviewRequired)
    )
      throw new ConflictException(
        'Handover deadline requires buyer consent and admin review',
      );
  }

  async create(
    userId: string,
    shopId: string,
    id: string,
    input: ShipmentCreateInput,
  ) {
    const prepared = await this.db.transaction(async (manager) => {
      await this.lock(manager);
      await this.access.assertManage(manager, userId, shopId, true);
      const order = await manager.findOneByOrFail(Order, { id, shopId });
      const existing = await manager.findOneBy(Shipment, { orderId: id });
      if (existing) return { existing };
      this.assertBookable(order, await this.now(manager));
      const { inputs, results } = await quoteInputs(manager, [
        Object.assign(new CheckoutOrder(), {
          id,
          shopId,
          items: order.items,
          address: order.address,
          subtotal: order.subtotal,
        }),
      ]);
      if (!inputs[0] || results[0].reason)
        throw new ConflictException('Valid pickup and parcel are required');
      const original = inputs[0].parcel;
      return {
        order,
        clientId: randomUUID(),
        carrierInput: { ...inputs[0], parcel: input.parcel ?? original },
        quotedParcel: original,
      };
    });
    if ('existing' in prepared && prepared.existing)
      return this.view(prepared.existing);
    if (!prepared.order || !prepared.carrierInput || !prepared.clientId)
      throw new ConflictException('Shipment preparation failed');
    const codAmount =
      prepared.order.paymentMethod === ORDER_PAYMENT_METHOD.COD
        ? prepared.order.total
        : 0;
    const payload = await this.carrier.prepare(
      prepared.carrierInput,
      codAmount,
      prepared.clientId,
    );
    const saved = await this.db.transaction(async (manager) => {
      await this.lock(manager);
      await this.access.assertManage(manager, userId, shopId, true);
      const order = await manager.findOneByOrFail(Order, { id, shopId });
      const existing = await manager.findOneBy(Shipment, { orderId: id });
      if (existing) return { row: existing, send: false };
      const now = await this.now(manager);
      this.assertBookable(order, now);
      const row = await manager.save(
        Shipment,
        manager.create(Shipment, {
          id: prepared.clientId,
          orderId: id,
          input: prepared.carrierInput,
          quotedParcel: prepared.quotedParcel,
          payload: { ...payload },
          codAmount,
          state: 'CREATING',
          nextQueryAt: new Date(now.getTime() + 75000),
        }),
      );
      return { row, send: true };
    });
    if (!saved.send) return this.view(saved.row);
    try {
      const response = await this.carrier.create(saved.row.payload);
      await this.db.transaction(async (manager) => {
        await this.lock(manager);
        const row = await manager.findOneByOrFail(Shipment, {
          id: saved.row.id,
        });
        if (row.orderCode && row.orderCode !== response.orderCode) {
          row.reviewReason = 'CARRIER_REFERENCE_MISMATCH';
        } else {
          row.orderCode = response.orderCode;
          row.carrierFee = response.fee;
          if (row.state === 'CREATING' || row.state === 'UNKNOWN')
            row.state = 'BOOKED';
        }
        row.nextQueryAt = await this.now(manager);
        await manager.save(row);
      });
    } catch {
      await this.db
        .getRepository(Shipment)
        .update({ id: saved.row.id, state: 'CREATING' }, { state: 'UNKNOWN' });
    }
    return this.view(
      await this.db
        .getRepository(Shipment)
        .findOneByOrFail({ id: saved.row.id }),
    );
  }

  async buyerView(buyerId: string, orderId: string) {
    await this.db
      .getRepository(Order)
      .findOneByOrFail({ id: orderId, buyerId });
    return this.view(
      await this.db.getRepository(Shipment).findOneByOrFail({ orderId }),
    );
  }
  async shopView(userId: string, shopId: string, orderId: string) {
    await this.access.assertManage(this.db.manager, userId, shopId);
    await this.db.getRepository(Order).findOneByOrFail({ id: orderId, shopId });
    return this.view(
      await this.db.getRepository(Shipment).findOneByOrFail({ orderId }),
    );
  }
  async label(userId: string, shopId: string, orderId: string) {
    await this.access.assertManage(this.db.manager, userId, shopId);
    const order = await this.db
      .getRepository(Order)
      .findOneByOrFail({ id: orderId, shopId });
    this.assertBookable(order, new Date());
    const row = await this.db
      .getRepository(Shipment)
      .findOneByOrFail({ orderId });
    if (!row.orderCode || row.state !== 'BOOKED')
      throw new ConflictException('Confirmed carrier booking is required');
    return this.carrier.print(row.orderCode);
  }

  async reconcile(id: string) {
    const lease = await this.db.transaction(async (manager) => {
      await this.lock(manager);
      const row = await manager.findOneByOrFail(Shipment, { id });
      const now = await this.now(manager);
      if (
        !row.nextQueryAt ||
        row.nextQueryAt > now ||
        row.state === 'CANCELLED'
      )
        return null;
      row.nextQueryAt = new Date(now.getTime() + 75000);
      await manager.save(row);
      return row;
    });
    if (!lease) return;
    try {
      let snapshot = await this.carrier.query(id);
      const cancellation = await this.apply(id, snapshot);
      if (cancellation && snapshot.status !== 'cancel') {
        await this.carrier.cancel(snapshot.orderCode);
        snapshot = await this.carrier.query(id);
        await this.apply(id, snapshot);
      }
    } catch {
      /* Unknown remains locked and retryable; never create another reference. */
    }
  }

  private async apply(id: string, snapshot: GhnShipmentSnapshot) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      const row = await manager.findOneByOrFail(Shipment, { id });
      const order = await manager.findOneByOrFail(Order, { id: row.orderId });
      const now = await this.now(manager);
      const updatedAt = new Date(snapshot.updatedAt);
      row.nextQueryAt = new Date(now.getTime() + 60000);
      if (
        snapshot.clientCode !== id ||
        snapshot.codAmount !== row.codAmount ||
        snapshot.paymentType !== 1 ||
        (row.orderCode && row.orderCode !== snapshot.orderCode) ||
        !Number.isFinite(updatedAt.getTime()) ||
        updatedAt.getTime() > now.getTime() + 300000
      ) {
        row.reviewReason = 'CARRIER_DATA_MISMATCH';
        await manager.save(row);
        return false;
      }
      if (row.providerUpdatedAt && updatedAt < row.providerUpdatedAt) {
        await manager.save(row);
        return false;
      }
      row.orderCode = snapshot.orderCode;
      row.providerStatus = snapshot.status;
      row.providerUpdatedAt = updatedAt;
      if (row.state === 'CREATING' || row.state === 'UNKNOWN')
        row.state = 'BOOKED';
      if (snapshot.codCollected && snapshot.collectedAt)
        row.codCollectedAt ??= new Date(snapshot.collectedAt);
      if (snapshot.codTransferred && snapshot.transferredAt)
        row.carrierTransferredAt ??= new Date(snapshot.transferredAt);
      if (
        snapshot.status === 'delivered' ||
        inTransit.has(snapshot.status) ||
        returning.has(snapshot.status)
      ) {
        row.pickedObservedAt ??= now;
        if (
          order.cancelState &&
          order.cancelState !== ORDER_CANCEL_STATE.CLOSED
        )
          row.reviewReason = 'PICKED_DURING_CANCELLATION';
        if (
          order.paymentMethod === ORDER_PAYMENT_METHOD.COD &&
          order.handoverBy &&
          now > order.handoverBy &&
          !order.deliveryObservedAt
        )
          order.handoverReviewRequired = true;
      }
      if (
        snapshot.status === 'delivered' &&
        !deliveryTerminalStatuses.includes(order.status)
      ) {
        order.status = ORDER_STATUS.DELIVERED;
        order.deliveryObservedAt ??= now;
        // updated_date is not proven delivery event time; do not start 72h payout.
        await this.event(manager, order.id, ORDER_EVENT_ACTION.DELIVERED, now);
        if (order.paymentMethod === ORDER_PAYMENT_METHOD.COD) {
          for (const item of order.items)
            await manager.update(
              Product,
              {
                id: item.productId,
                reservedOrderId: order.id,
                status: ProductStatus.HELD,
              },
              {
                status: ProductStatus.SOLD,
                reservedOrderId: null,
                soldOrderId: order.id,
                soldAt: now,
              },
            );
        }
      } else if (
        returning.has(snapshot.status) &&
        !returnTerminalStatuses.includes(order.status)
      ) {
        order.status = ORDER_STATUS.RETURNS;
        row.reviewReason ??= 'RETURN_REQUIRES_RECONCILIATION';
        if (snapshot.status === 'returned') order.carrierReturnedAt ??= now;
        await this.event(manager, order.id, ORDER_EVENT_ACTION.RETURNING, now);
      } else if (
        inTransit.has(snapshot.status) &&
        order.status === ORDER_STATUS.PREPARING
      ) {
        order.status = ORDER_STATUS.SHIPPING;
        await this.event(manager, order.id, ORDER_EVENT_ACTION.SHIPPING, now);
      } else if (snapshot.status === 'cancel') {
        if (
          row.cancelRequestedAt &&
          !row.pickedObservedAt &&
          !row.codCollectedAt &&
          !row.carrierTransferredAt &&
          order.paymentMethod === ORDER_PAYMENT_METHOD.COD &&
          order.cancelState === ORDER_CANCEL_STATE.APPROVED
        ) {
          await this.orders.cancelCodVerified(manager, order, now);
          row.state = 'CANCELLED';
          row.nextQueryAt = null;
        } else row.reviewReason ??= 'UNEXPECTED_CARRIER_CANCELLATION';
      } else if (
        ['lost', 'damage', 'scrap', 'exception'].includes(snapshot.status)
      )
        row.reviewReason = 'CARRIER_INCIDENT';
      if (
        row.cancelRequestedAt &&
        now.getTime() - row.cancelRequestedAt.getTime() >= 1800000 &&
        row.state !== 'CANCELLED'
      )
        row.reviewReason ??= 'CANCELLATION_UNRESOLVED_30_MINUTES';
      await manager.save(order);
      await manager.save(row);
      return (
        row.state === 'CANCEL_PENDING' &&
        !row.pickedObservedAt &&
        order.cancelState === ORDER_CANCEL_STATE.APPROVED
      );
    });
  }

  private async event(
    manager: EntityManager,
    orderId: string,
    action: OrderEvent['action'],
    now: Date,
  ) {
    if (!(await manager.existsBy(OrderEvent, { orderId, action })))
      await manager.save(
        OrderEvent,
        manager.create(OrderEvent, {
          orderId,
          action,
          actorId: null,
          reason: null,
          createdAt: now,
        }),
      );
  }
  private view(row: Shipment) {
    return {
      ...row,
      parcel: row.input.parcel,
      payload: undefined,
      input: undefined,
    };
  }

  async run() {
    const [{ now }] = await this.db.query('SELECT clock_timestamp() AS now');
    // Escalate by elapsed DB time even if GHN never returns a usable snapshot.
    // A query timeout must not hide the very cancellation incident it caused.
    const cutoff = new Date(new Date(now).getTime() - 1800000);
    await this.db
      .getRepository(Shipment)
      .createQueryBuilder()
      .update()
      .set({ reviewReason: 'CANCELLATION_UNRESOLVED_30_MINUTES' })
      .where(
        'state = :state AND "cancelRequestedAt" <= :cutoff AND "reviewReason" IS NULL',
        { state: 'CANCEL_PENDING', cutoff },
      )
      .execute();
    await this.db
      .getRepository(Shipment)
      .createQueryBuilder()
      .update()
      .set({ reviewReason: 'BOOKING_UNRESOLVED_30_MINUTES' })
      .where(
        'state IN (:...states) AND "createdAt" <= :cutoff AND "reviewReason" IS NULL',
        { states: ['CREATING', 'UNKNOWN'], cutoff },
      )
      .execute();
    const rows = await this.db
      .getRepository(Shipment)
      .createQueryBuilder('shipment')
      .where('shipment.nextQueryAt <= :now', { now })
      .orderBy('shipment.nextQueryAt', 'ASC')
      .take(10)
      .getMany();
    for (const row of rows) {
      try {
        await this.reconcile(row.id);
      } catch {
        this.logger.warn({
          shipmentId: row.id,
          message: 'Shipment requires reconciliation',
        });
      }
    }
  }

  async reconcileBuyer(buyerId: string, orderId: string) {
    await this.db
      .getRepository(Order)
      .findOneByOrFail({ id: orderId, buyerId });
    const row = await this.db
      .getRepository(Shipment)
      .findOneByOrFail({ orderId });
    await this.reconcile(row.id);
    return this.buyerView(buyerId, orderId);
  }

  async incidents() {
    const shipments = await this.db
      .getRepository(Shipment)
      .createQueryBuilder('shipment')
      .where('shipment.reviewReason IS NOT NULL')
      .orderBy('shipment.createdAt', 'ASC')
      .take(100)
      .getMany();
    const orders = await this.db
      .getRepository(Order)
      .createQueryBuilder('order')
      .where(
        'order.handoverReviewRequired = true OR order.cancelState = :state',
        { state: ORDER_CANCEL_STATE.ADMIN_REVIEW },
      )
      .orderBy('order.createdAt', 'ASC')
      .take(100)
      .getMany();
    return { shipments: shipments.map((row) => this.view(row)), orders };
  }
}
