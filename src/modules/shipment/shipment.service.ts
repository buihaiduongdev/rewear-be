import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { GhnShipmentClient } from '@/infrastructure/shipping/clients/ghn-shipment.client';
import {
  GHN_IN_TRANSIT_STATUSES,
  GHN_INCIDENT_STATUSES,
  GHN_RETURN_STATUSES,
} from '@/infrastructure/shipping/constants/ghn-shipment.constant';
import { GHN_SHIPMENT_STATUS } from '@/infrastructure/shipping/constants/ghn-shipment.constant';
import type { GhnShipmentSnapshot } from '@/infrastructure/shipping/types/ghn-shipment.type';
import { CheckoutOrder } from '@/modules/checkout/entities/checkout-order.entity';
import { quoteInputs } from '@/modules/checkout/shipping-quote.inputs';
import {
  ORDER_CANCEL_STATE,
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import { Order, OrderEvent } from '@/modules/order/entities/order.entity';
import { OrderAccess } from '@/modules/order/order.access';
import { OrderService } from '@/modules/order/order.service';
import type {
  OrderCancelState,
  OrderState,
} from '@/modules/order/types/order.type';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';

import { FULFILLMENT_POLICY } from './constants/fulfillment.constant';
import { SHIPMENT_RECOVERY_ACTION } from './constants/shipment.constant';
import {
  SHIPMENT_REVIEW_REASON,
  SHIPMENT_STATE,
} from './constants/shipment.constant';
import { Shipment } from './entities/shipment.entity';
import type { ShipmentCreateInput } from './types/shipment.type';

const incidentStatuses = new Set<string>(GHN_INCIDENT_STATUSES);
const inTransit = new Set<string>(GHN_IN_TRANSIT_STATUSES);
const returning = new Set<string>(GHN_RETURN_STATUSES);
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
    const bookingBlocked =
      order.status !== ORDER_STATUS.PREPARING ||
      (order.cancelState &&
        bookingBlockedCancelStates.includes(order.cancelState)) ||
      (order.cancelState === ORDER_CANCEL_STATE.REJECTED &&
        order.cancelReviewUntil &&
        order.cancelReviewUntil > now);
    if (bookingBlocked)
      throw new ConflictException(
        'Order cannot be booked while cancellation or shipment is in progress',
      );
    const handoverReviewRequired =
      order.paymentMethod === ORDER_PAYMENT_METHOD.COD &&
      (!order.handoverBy ||
        order.handoverBy <= now ||
        order.handoverReviewRequired);
    if (handoverReviewRequired)
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
    const prepared = await this.prepareBooking(userId, shopId, id, input);
    const bookingAlreadyExists = 'existing' in prepared && prepared.existing;
    if (bookingAlreadyExists) return this.view(prepared.existing);
    const { order: preparedOrder, carrierInput, clientId } = prepared;
    const bookingPreparationIncomplete =
      !preparedOrder || !carrierInput || !clientId;
    if (bookingPreparationIncomplete)
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
      const response = await this.carrier.create(shipment.payload);
      await this.db.transaction(async (manager) => {
        await this.lock(manager);
        const row = await manager.findOneByOrFail(Shipment, {
          id: shipment.id,
        });
        const carrierReferenceMismatch =
          row.orderCode && row.orderCode !== response.orderCode;
        if (carrierReferenceMismatch) {
          row.reviewReason = SHIPMENT_REVIEW_REASON.CARRIER_REFERENCE_MISMATCH;
        } else {
          row.orderCode = response.orderCode;
          row.carrierFee = response.fee;
          const bookingUnconfirmed =
            row.state === SHIPMENT_STATE.CREATING ||
            row.state === SHIPMENT_STATE.UNKNOWN;
          if (bookingUnconfirmed) row.state = SHIPMENT_STATE.BOOKED;
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
    userId: string,
    shopId: string,
    id: string,
    input: ShipmentCreateInput,
  ) {
    return this.db.transaction(async (manager) => {
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
      const quotedInput = inputs[0];
      const quoteUnavailable = !quotedInput || results[0].reason;
      if (quoteUnavailable)
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
    const orderCode = row.orderCode;
    const bookingUnconfirmed =
      !orderCode || row.state !== SHIPMENT_STATE.BOOKED;
    if (bookingUnconfirmed)
      throw new ConflictException('Confirmed carrier booking is required');
    return this.carrier.print(orderCode);
  }

  async reconcile(id: string) {
    const lease = await this.db.transaction(async (manager) => {
      await this.lock(manager);
      const row = await manager.findOneByOrFail(Shipment, { id });
      const now = await this.now(manager);
      const queryLeaseUnavailable =
        !row.nextQueryAt ||
        row.nextQueryAt > now ||
        row.state === SHIPMENT_STATE.CANCELLED;
      if (queryLeaseUnavailable) return null;
      row.nextQueryAt = new Date(
        now.getTime() + FULFILLMENT_POLICY.QUERY_LEASE_MS,
      );
      await manager.save(row);
      return row;
    });
    if (!lease) return;
    try {
      let snapshot = await this.carrier.query(id);
      const cancellation = await this.apply(id, snapshot);
      const carrierRecoveryRequired =
        cancellation &&
        snapshot.status !== GHN_SHIPMENT_STATUS.CANCEL &&
        snapshot.status !== GHN_SHIPMENT_STATUS.RETURNED;
      if (carrierRecoveryRequired) {
        if (cancellation === SHIPMENT_RECOVERY_ACTION.RETURN)
          await this.carrier.requestReturn(snapshot.orderCode);
        else await this.carrier.cancel(snapshot.orderCode);
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
      row.nextQueryAt = new Date(
        now.getTime() + FULFILLMENT_POLICY.QUERY_INTERVAL_MS,
      );
      const carrierReferenceMismatch =
        snapshot.clientCode !== id ||
        (row.orderCode && row.orderCode !== snapshot.orderCode);
      const carrierPaymentMismatch =
        snapshot.codAmount !== row.codAmount || snapshot.paymentType !== 1;
      const carrierTimestampInvalid =
        !Number.isFinite(updatedAt.getTime()) ||
        updatedAt.getTime() >
          now.getTime() + FULFILLMENT_POLICY.PROVIDER_CLOCK_TOLERANCE_MS;
      const carrierDataMismatch =
        carrierReferenceMismatch ||
        carrierPaymentMismatch ||
        carrierTimestampInvalid;
      if (carrierDataMismatch) {
        row.reviewReason = SHIPMENT_REVIEW_REASON.CARRIER_DATA_MISMATCH;
        await manager.save(row);
        return false;
      }
      const snapshotOutdated =
        row.providerUpdatedAt && updatedAt < row.providerUpdatedAt;
      if (snapshotOutdated) {
        await manager.save(row);
        return false;
      }
      this.observeCarrierSnapshot(row, order, snapshot, now, updatedAt);
      await this.applyCarrierStatus(manager, row, order, snapshot, now);
      const cancellationUnresolved =
        row.cancelRequestedAt &&
        now.getTime() - row.cancelRequestedAt.getTime() >=
          FULFILLMENT_POLICY.UNKNOWN_ESCALATION_MS &&
        row.state !== SHIPMENT_STATE.CANCELLED;
      if (cancellationUnresolved)
        row.reviewReason ??=
          SHIPMENT_REVIEW_REASON.CANCELLATION_UNRESOLVED_30_MINUTES;
      await manager.save(order);
      await manager.save(row);
      const returnRequired =
        row.returnRequestedAt &&
        !row.codCollectedAt &&
        !row.carrierTransferredAt &&
        snapshot.status !== GHN_SHIPMENT_STATUS.DELIVERED;
      if (returnRequired) return SHIPMENT_RECOVERY_ACTION.RETURN;
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
    const deliveryObserved =
      snapshot.status === GHN_SHIPMENT_STATUS.DELIVERED &&
      !deliveryTerminalStatuses.includes(order.status);
    const returnObserved =
      returning.has(snapshot.status) &&
      !returnTerminalStatuses.includes(order.status);
    const transitObserved =
      inTransit.has(snapshot.status) && order.status === ORDER_STATUS.PREPARING;
    if (deliveryObserved) {
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
    } else if (returnObserved) {
      order.status = ORDER_STATUS.RETURNS;
      row.reviewReason ??=
        SHIPMENT_REVIEW_REASON.RETURN_REQUIRES_RECONCILIATION;
      if (snapshot.status === GHN_SHIPMENT_STATUS.RETURNED)
        order.carrierReturnedAt ??= now;
      await this.event(manager, order.id, ORDER_EVENT_ACTION.RETURNING, now);
    } else if (transitObserved) {
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
        await this.orders.cancelCodVerified(manager, order, now);
        row.state = SHIPMENT_STATE.CANCELLED;
        row.nextQueryAt = null;
      } else
        row.reviewReason ??=
          SHIPMENT_REVIEW_REASON.UNEXPECTED_CARRIER_CANCELLATION;
    } else if (incidentStatuses.has(snapshot.status))
      row.reviewReason = SHIPMENT_REVIEW_REASON.CARRIER_INCIDENT;
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
    const bookingUnconfirmed =
      row.state === SHIPMENT_STATE.CREATING ||
      row.state === SHIPMENT_STATE.UNKNOWN;
    if (bookingUnconfirmed) row.state = SHIPMENT_STATE.BOOKED;
    const collectedAt = snapshot.collectedAt;
    const collectionReported = snapshot.codCollected && collectedAt;
    if (collectionReported) row.codCollectedAt ??= new Date(collectedAt);
    const transferredAt = snapshot.transferredAt;
    const transferReported = snapshot.codTransferred && transferredAt;
    if (transferReported) row.carrierTransferredAt ??= new Date(transferredAt);
    const pickupObserved =
      snapshot.status === GHN_SHIPMENT_STATUS.DELIVERED ||
      inTransit.has(snapshot.status) ||
      returning.has(snapshot.status);
    if (pickupObserved) {
      row.pickedObservedAt ??= now;
      const pickupDuringCancellation =
        row.cancelRequestedAt &&
        order.cancelState === ORDER_CANCEL_STATE.APPROVED;
      if (pickupDuringCancellation) {
        row.returnRequestedAt ??= now;
        row.reviewReason = SHIPMENT_REVIEW_REASON.PICKED_DURING_CANCELLATION;
      }
      const cancellationOpen =
        order.cancelState && order.cancelState !== ORDER_CANCEL_STATE.CLOSED;
      if (cancellationOpen)
        row.reviewReason = SHIPMENT_REVIEW_REASON.PICKED_DURING_CANCELLATION;
      const pickupAfterDeadline =
        order.paymentMethod === ORDER_PAYMENT_METHOD.COD &&
        order.handoverBy &&
        row.pickedObservedAt > order.handoverBy &&
        !order.deliveryObservedAt;
      if (pickupAfterDeadline) order.handoverReviewRequired = true;
    }
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
