import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { GhnShipmentClient } from '@/infrastructure/shipping/clients/ghn-shipment.client';
import {
  GHN_IN_TRANSIT_STATUSES,
  GHN_INCIDENT_STATUSES,
  GHN_RETURN_STATUSES,
  GHN_SHIPMENT_STATUS,
} from '@/infrastructure/shipping/constants/ghn-shipment.constant';
import type { GhnShipmentSnapshot } from '@/infrastructure/shipping/types/ghn-shipment.type';
import { CheckoutOrder } from '@/modules/checkout/entities/checkout-order.entity';
import { quoteInputs } from '@/modules/checkout/shipping-quote.inputs';
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxService } from '@/modules/event/outbox.service';
import {
  ORDER_CANCEL_STATE,
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import { Order, OrderEvent } from '@/modules/order/entities';
import { OrderService } from '@/modules/order/order.service';
import type {
  OrderCancelState,
  OrderState,
} from '@/modules/order/schemas/order.schema';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';

import {
  FULFILLMENT_POLICY,
  SHIPMENT_RECOVERY_ACTION,
  SHIPMENT_REVIEW_REASON,
  SHIPMENT_STATE,
} from './constants/shipment.constant';
import { Shipment } from './entities/shipment.entity';
import type {
  GhnWebhookInput,
  ShipmentCreateInput,
} from './schemas/shipment.schema';

const incidentStatuses = new Set<string>(GHN_INCIDENT_STATUSES);
const inTransit = new Set<string>(GHN_IN_TRANSIT_STATUSES);
const returning = new Set<string>(GHN_RETURN_STATUSES);
const bookingBlockedCancelStates: readonly OrderCancelState[] = [
  ORDER_CANCEL_STATE.APPROVED,
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
    private readonly orderService: OrderService,
    private readonly carrier: GhnShipmentClient,
    private readonly outboxService: OutboxService = new OutboxService(),
  ) {}

  private async now(manager: EntityManager) {
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }

  private assertBookable(order: Order, now: Date) {
    const bookingBlocked =
      order.status !== ORDER_STATUS.PREPARING ||
      (order.cancelState &&
        bookingBlockedCancelStates.includes(order.cancelState));
    if (bookingBlocked)
      throw new ConflictException(
        'Order cannot be booked while cancellation or shipment is in progress',
      );
    const handoverExpired =
      order.paymentMethod === ORDER_PAYMENT_METHOD.COD &&
      (!order.handoverBy ||
        order.handoverBy <= now ||
        order.handoverReviewRequired);
    if (handoverExpired)
      throw new ConflictException('Order handover deadline has expired');
  }

  async create(
    _userId: string,
    shopId: string,
    id: string,
    input: ShipmentCreateInput,
  ) {
    const prepared = await this.prepareBooking(shopId, id, input);
    if ('existing' in prepared && prepared.existing)
      return this.view(prepared.existing);
    const { order: preparedOrder, carrierInput, clientId } = prepared;
    if (!preparedOrder || !carrierInput || !clientId)
      throw new ConflictException('Shipment preparation failed');
    const codAmount =
      preparedOrder.paymentMethod === ORDER_PAYMENT_METHOD.COD
        ? preparedOrder.total
        : 0;
    const payload = await this.carrier.prepare(
      carrierInput,
      codAmount,
      clientId,
    );
    const saved = await this.db.transaction(async (manager) => {
      const order = await manager.findOneOrFail(Order, {
        where: { id, shopId },
        lock: { mode: 'pessimistic_write' },
      });
      const existing = await manager.findOneBy(Shipment, { orderId: id });
      if (existing) return { row: existing, send: false };
      const now = await this.now(manager);
      this.assertBookable(order, now);
      const row = await manager.save(
        Shipment,
        manager.create(Shipment, {
          id: clientId,
          orderId: id,
          input: carrierInput,
          quotedParcel: prepared.quotedParcel,
          payload: { ...payload },
          codAmount,
          state: SHIPMENT_STATE.CREATING,
          nextQueryAt: new Date(
            now.getTime() + FULFILLMENT_POLICY.QUERY_LEASE_MS,
          ),
        }),
      );
      return { row, send: true };
    });
    if (!saved.send) return this.view(saved.row);
    await this.submitBooking(saved.row);
    return this.view(
      await this.db
        .getRepository(Shipment)
        .findOneByOrFail({ id: saved.row.id }),
    );
  }

  private async submitBooking(shipment: Shipment) {
    try {
      const response = await this.carrier.create(
        shipment.payload,
        shipment.input.ghnShopId,
      );
      await this.db.transaction(async (manager) => {
        const row = await manager.findOneOrFail(Shipment, {
          where: { id: shipment.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (row.orderCode && row.orderCode !== response.orderCode) {
          row.reviewReason = SHIPMENT_REVIEW_REASON.CARRIER_REFERENCE_MISMATCH;
        } else {
          row.orderCode = response.orderCode;
          row.carrierFee = response.fee;
          if (
            row.state === SHIPMENT_STATE.CREATING ||
            row.state === SHIPMENT_STATE.UNKNOWN
          ) {
            row.state = SHIPMENT_STATE.BOOKED;
          }
        }
        row.nextQueryAt = await this.now(manager);
        await manager.save(row);
      });
    } catch {
      await this.db
        .getRepository(Shipment)
        .update(
          { id: shipment.id, state: SHIPMENT_STATE.CREATING },
          { state: SHIPMENT_STATE.UNKNOWN },
        );
    }
  }

  private async prepareBooking(
    shopId: string,
    id: string,
    input: ShipmentCreateInput,
  ) {
    return this.db.transaction(async (manager) => {
      const order = await manager.findOneOrFail(Order, {
        where: { id, shopId },
        lock: { mode: 'pessimistic_read' },
      });
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
      const quotedInput = inputs[0];
      if (!quotedInput || results[0].reason)
        throw new ConflictException('Valid pickup and parcel are required');
      const original = quotedInput.parcel;
      return {
        order,
        clientId: randomUUID(),
        carrierInput: { ...quotedInput, parcel: input.parcel ?? original },
        quotedParcel: original,
      };
    });
  }

  async buyerView(buyerId: string, orderId: string) {
    await this.db
      .getRepository(Order)
      .findOneByOrFail({ id: orderId, buyerId });
    return this.view(
      await this.db.getRepository(Shipment).findOneByOrFail({ orderId }),
    );
  }

  async shopView(_userId: string, shopId: string, orderId: string) {
    await this.db.getRepository(Order).findOneByOrFail({ id: orderId, shopId });
    return this.view(
      await this.db.getRepository(Shipment).findOneByOrFail({ orderId }),
    );
  }

  async label(_userId: string, shopId: string, orderId: string) {
    const order = await this.db
      .getRepository(Order)
      .findOneByOrFail({ id: orderId, shopId });
    this.assertBookable(order, new Date());
    const row = await this.db
      .getRepository(Shipment)
      .findOneByOrFail({ orderId });
    if (!row.orderCode || row.state !== SHIPMENT_STATE.BOOKED)
      throw new ConflictException('Confirmed carrier booking is required');
    return this.carrier.print(row.orderCode, row.input.ghnShopId);
  }

  async webhook(input: GhnWebhookInput) {
    const row = await this.db.getRepository(Shipment).findOne({
      where: input.ClientOrderCode
        ? [{ id: input.ClientOrderCode }, { orderCode: input.OrderCode }]
        : { orderCode: input.OrderCode },
    });
    if (!row) return { synced: false };
    await this.db
      .getRepository(Shipment)
      .update({ id: row.id }, { nextQueryAt: new Date(0) });
    await this.reconcile(row.id);
    return { synced: true };
  }

  async reconcile(id: string) {
    const lease = await this.db.transaction(async (manager) => {
      const row = await manager.findOneOrFail(Shipment, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      const now = await this.now(manager);
      if (row.state === SHIPMENT_STATE.CANCELLED) {
        if (row.nextQueryAt) {
          row.nextQueryAt = null;
          await manager.save(row);
        }
        return null;
      }
      if (!row.nextQueryAt || row.nextQueryAt > now) return null;
      row.nextQueryAt = new Date(
        now.getTime() + FULFILLMENT_POLICY.QUERY_LEASE_MS,
      );
      await manager.save(row);
      return row;
    });
    if (!lease) return;
    try {
      let snapshot = await this.carrier.query(id, lease.input.ghnShopId);
      const cancellation = await this.apply(id, snapshot);
      if (
        cancellation &&
        snapshot.status !== GHN_SHIPMENT_STATUS.CANCEL &&
        snapshot.status !== GHN_SHIPMENT_STATUS.RETURNED
      ) {
        if (cancellation === SHIPMENT_RECOVERY_ACTION.RETURN)
          await this.carrier.requestReturn(
            snapshot.orderCode,
            lease.input.ghnShopId,
          );
        else
          await this.carrier.cancel(snapshot.orderCode, lease.input.ghnShopId);
        snapshot = await this.carrier.query(id, lease.input.ghnShopId);
        await this.apply(id, snapshot);
      }
    } catch {
      /* Retry on next sync pass without creating a duplicate reference. */
    }
  }

  private async apply(id: string, snapshot: GhnShipmentSnapshot) {
    return this.db.transaction(async (manager) => {
      const target = await manager.findOneByOrFail(Shipment, { id });
      const order = await manager.findOneOrFail(Order, {
        where: { id: target.orderId },
        lock: { mode: 'pessimistic_write' },
      });
      const row = await manager.findOneOrFail(Shipment, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      const now = await this.now(manager);
      const updatedAt = new Date(snapshot.updatedAt);
      row.nextQueryAt = new Date(
        now.getTime() + FULFILLMENT_POLICY.QUERY_INTERVAL_MS,
      );
      const carrierDataMismatch =
        snapshot.clientCode !== id ||
        (row.orderCode && row.orderCode !== snapshot.orderCode) ||
        snapshot.codAmount !== row.codAmount ||
        snapshot.paymentType !== 1 ||
        !Number.isFinite(updatedAt.getTime()) ||
        updatedAt.getTime() >
          now.getTime() + FULFILLMENT_POLICY.PROVIDER_CLOCK_TOLERANCE_MS;
      if (carrierDataMismatch) {
        row.reviewReason = SHIPMENT_REVIEW_REASON.CARRIER_DATA_MISMATCH;
        await manager.save(row);
        return false;
      }
      if (row.providerUpdatedAt && updatedAt < row.providerUpdatedAt) {
        await manager.save(row);
        return false;
      }
      this.observeCarrierSnapshot(row, order, snapshot, now, updatedAt);
      await this.applyCarrierStatus(manager, row, order, snapshot, now);
      if (
        row.cancelRequestedAt &&
        now.getTime() - row.cancelRequestedAt.getTime() >=
          FULFILLMENT_POLICY.UNKNOWN_ESCALATION_MS &&
        row.state !== SHIPMENT_STATE.CANCELLED
      ) {
        row.reviewReason ??=
          SHIPMENT_REVIEW_REASON.CANCELLATION_UNRESOLVED_30_MINUTES;
      }
      const deliveredTerminal =
        (order.status === ORDER_STATUS.DELIVERED ||
          order.status === ORDER_STATUS.COMPLETED) &&
        (order.paymentMethod !== ORDER_PAYMENT_METHOD.COD ||
          Boolean(row.codCollectedAt && row.carrierTransferredAt));
      if (
        row.state === SHIPMENT_STATE.CANCELLED ||
        order.status === ORDER_STATUS.CANCELLED ||
        deliveredTerminal
      ) {
        row.nextQueryAt = null;
      }
      await manager.save(order);
      await manager.save(row);
      if (
        row.returnRequestedAt &&
        !row.codCollectedAt &&
        !row.carrierTransferredAt &&
        snapshot.status !== GHN_SHIPMENT_STATUS.DELIVERED
      )
        return SHIPMENT_RECOVERY_ACTION.RETURN;
      const cancellationRequired =
        row.state === SHIPMENT_STATE.CANCEL_PENDING &&
        !row.pickedObservedAt &&
        order.cancelState === ORDER_CANCEL_STATE.APPROVED;
      return cancellationRequired ? SHIPMENT_RECOVERY_ACTION.CANCEL : false;
    });
  }

  private async applyCarrierStatus(
    manager: EntityManager,
    row: Shipment,
    order: Order,
    snapshot: GhnShipmentSnapshot,
    now: Date,
  ) {
    if (
      snapshot.status === GHN_SHIPMENT_STATUS.DELIVERED &&
      !deliveryTerminalStatuses.includes(order.status)
    ) {
      order.status = ORDER_STATUS.DELIVERED;
      order.deliveryObservedAt ??= now;
      await this.event(manager, order.id, ORDER_EVENT_ACTION.DELIVERED, now);
      if (order.paymentMethod === ORDER_PAYMENT_METHOD.COD) {
        const itemIds = order.items.map((item) => item.productId);
        if (itemIds.length > 0) {
          await manager.update(
            Product,
            {
              id: In(itemIds),
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
      }
    } else if (
      returning.has(snapshot.status) &&
      !returnTerminalStatuses.includes(order.status)
    ) {
      order.status = ORDER_STATUS.RETURNS;
      row.reviewReason ??=
        SHIPMENT_REVIEW_REASON.RETURN_REQUIRES_RECONCILIATION;
      if (snapshot.status === GHN_SHIPMENT_STATUS.RETURNED)
        order.carrierReturnedAt ??= now;
      await this.event(manager, order.id, ORDER_EVENT_ACTION.RETURNING, now);
    } else if (
      inTransit.has(snapshot.status) &&
      order.status === ORDER_STATUS.PREPARING
    ) {
      order.status = ORDER_STATUS.SHIPPING;
      await this.event(manager, order.id, ORDER_EVENT_ACTION.SHIPPING, now);
    } else if (snapshot.status === GHN_SHIPMENT_STATUS.CANCEL) {
      const cancellationVerified =
        row.cancelRequestedAt &&
        !row.pickedObservedAt &&
        !row.codCollectedAt &&
        !row.carrierTransferredAt &&
        order.paymentMethod === ORDER_PAYMENT_METHOD.COD &&
        order.cancelState === ORDER_CANCEL_STATE.APPROVED;
      if (cancellationVerified) {
        await this.orderService.cancelCodVerified(manager, order, now);
        row.state = SHIPMENT_STATE.CANCELLED;
        row.nextQueryAt = null;
      } else {
        row.reviewReason ??=
          SHIPMENT_REVIEW_REASON.UNEXPECTED_CARRIER_CANCELLATION;
      }
    } else if (incidentStatuses.has(snapshot.status)) {
      row.reviewReason = SHIPMENT_REVIEW_REASON.CARRIER_INCIDENT;
    }
  }

  private observeCarrierSnapshot(
    row: Shipment,
    order: Order,
    snapshot: GhnShipmentSnapshot,
    now: Date,
    updatedAt: Date,
  ) {
    row.orderCode = snapshot.orderCode;
    row.providerStatus = snapshot.status;
    row.providerUpdatedAt = updatedAt;
    if (
      row.state === SHIPMENT_STATE.CREATING ||
      row.state === SHIPMENT_STATE.UNKNOWN
    )
      row.state = SHIPMENT_STATE.BOOKED;
    if (snapshot.codCollected && snapshot.collectedAt)
      row.codCollectedAt ??= new Date(snapshot.collectedAt);
    if (snapshot.codTransferred && snapshot.transferredAt)
      row.carrierTransferredAt ??= new Date(snapshot.transferredAt);
    const pickupObserved =
      snapshot.status === GHN_SHIPMENT_STATUS.DELIVERED ||
      inTransit.has(snapshot.status) ||
      returning.has(snapshot.status);
    if (pickupObserved) {
      row.pickedObservedAt ??= now;
      if (
        row.cancelRequestedAt &&
        order.cancelState === ORDER_CANCEL_STATE.APPROVED
      ) {
        row.returnRequestedAt ??= now;
        row.reviewReason = SHIPMENT_REVIEW_REASON.PICKED_DURING_CANCELLATION;
      }
      if (order.cancelState && order.cancelState !== ORDER_CANCEL_STATE.CLOSED)
        row.reviewReason = SHIPMENT_REVIEW_REASON.PICKED_DURING_CANCELLATION;
      if (
        order.paymentMethod === ORDER_PAYMENT_METHOD.COD &&
        order.handoverBy &&
        row.pickedObservedAt > order.handoverBy &&
        !order.deliveryObservedAt
      )
        order.handoverReviewRequired = true;
    }
  }

  private async event(
    manager: EntityManager,
    orderId: string,
    action: OrderEvent['action'],
    now: Date,
  ) {
    if (!(await manager.existsBy(OrderEvent, { orderId, action }))) {
      const event = await manager.save(
        OrderEvent,
        manager.create(OrderEvent, {
          orderId,
          action,
          actorId: null,
          reason: null,
          createdAt: now,
        }),
      );
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        select: { id: true, buyerId: true, shopId: true },
      });
      if (order) {
        await this.outboxService.record(manager, {
          eventType: EVENT_TYPES.ORDER_UPDATED,
          resourceId: order.id,
          payload: {
            orderId: order.id,
            orderEventId: event.id,
            buyerId: order.buyerId,
            shopId: order.shopId,
            action: event.action,
          },
        });
      }
    }
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
    const cutoff = new Date(
      new Date(now).getTime() - FULFILLMENT_POLICY.UNKNOWN_ESCALATION_MS,
    );
    await this.db
      .getRepository(Shipment)
      .createQueryBuilder()
      .update()
      .set({
        reviewReason: SHIPMENT_REVIEW_REASON.CANCELLATION_UNRESOLVED_30_MINUTES,
      })
      .where(
        'state = :state AND "cancelRequestedAt" <= :cutoff AND "reviewReason" IS NULL',
        { state: SHIPMENT_STATE.CANCEL_PENDING, cutoff },
      )
      .execute();
    await this.db
      .getRepository(Shipment)
      .createQueryBuilder()
      .update()
      .set({
        reviewReason: SHIPMENT_REVIEW_REASON.BOOKING_UNRESOLVED_30_MINUTES,
      })
      .where(
        'state IN (:...states) AND "createdAt" <= :cutoff AND "reviewReason" IS NULL',
        { states: [SHIPMENT_STATE.CREATING, SHIPMENT_STATE.UNKNOWN], cutoff },
      )
      .execute();
    await this.db
      .getRepository(Order)
      .createQueryBuilder()
      .update()
      .set({ handoverReviewRequired: true })
      .where(
        '"paymentMethod" = :method AND status = :status AND "handoverBy" <= :now AND "handoverReviewRequired" = false',
        {
          method: ORDER_PAYMENT_METHOD.COD,
          status: ORDER_STATUS.PREPARING,
          now,
        },
      )
      .execute();
    const rows = await this.db
      .getRepository(Shipment)
      .createQueryBuilder('shipment')
      .where('shipment.nextQueryAt <= :now AND shipment.state <> :cancelled', {
        now,
        cancelled: SHIPMENT_STATE.CANCELLED,
      })
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
}
