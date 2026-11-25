import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import {
  ORDER_CANCEL_STATE,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities';
import { OrderService } from '@/modules/order/order.service';
import type { OrderState } from '@/modules/order/schemas/order.schema';
import { ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole } from '@/modules/shop/enums';

import { FULFILLMENT_POLICY } from './constants/fulfillment.constant';
import {
  HANDOVER_ACTION,
  HANDOVER_STOP_REASON,
} from './constants/late-handover.constant';
import { HANDOVER_STATE } from './constants/late-handover.constant';
import {
  SHIPMENT_REVIEW_REASON,
  SHIPMENT_STATE,
} from './constants/shipment.constant';
import {
  FulfillmentCalendar,
  FulfillmentNotice,
  HandoverCase,
  Shipment,
} from './entities';
import type {
  CalendarInput,
  HandoverAction,
  HandoverProposal,
  HandoverResponseInput,
  HandoverState,
  HandoverStop,
  HandoverStopReason,
} from './schemas/late-handover.schema';
import type { FulfillmentListInput } from './schemas/shipment.schema';
import { fulfillmentDeadline } from './utils/fulfillment-calendar';

const handoverReviewStates: readonly HandoverState[] = [
  HANDOVER_STATE.REVIEW,
  HANDOVER_STATE.OFFERED,
];
const extendableOrderStates: readonly OrderState[] = [
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.SHIPPING,
];

@Injectable()
export class LateHandoverService {
  private readonly logger = new Logger(LateHandoverService.name);
  constructor(
    private readonly db: DataSource,
    private readonly orderService: OrderService,
  ) {}

  private async lock(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
  }
  private async now(manager: EntityManager) {
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }
  private async audit(
    manager: EntityManager,
    row: HandoverCase,
    action: HandoverAction,
    actorId: string | null,
    now: Date,
    reason: string,
  ) {
    row.events = [
      ...row.events,
      { action, actorId, at: now.toISOString(), reason },
    ];
    const order = await manager.findOneByOrFail(Order, { id: row.orderId });
    const owner = await manager.findOneBy(ShopMember, {
      shopId: order.shopId,
      memberRole: ShopMemberRole.OWNER,
    });
    const recipientIds = Array.from(
      new Set([order.buyerId, ...(owner ? [owner.userId] : [])]),
    );
    if (recipientIds.length > 0) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(FulfillmentNotice)
        .values(
          recipientIds.map((recipientId) => ({
            orderId: row.orderId,
            recipientId,
            action,
            reason,
            createdAt: now,
          })),
        )
        .orIgnore()
        .execute();
    }
  }

  async notices(recipientId: string, input: FulfillmentListInput = {}) {
    return this.db.getRepository(FulfillmentNotice).find({
      where: { recipientId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
      skip: input.offset ?? 0,
    });
  }

  async configureCalendar(adminId: string, input: CalendarInput) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      // Stored deadlines remain immutable; a calendar update only supplies missing coverage.
      return manager.save(FulfillmentCalendar, {
        ...input,
        closedDates: [...new Set(input.closedDates)].sort(),
        approvedBy: adminId,
      });
    });
  }

  async buyerView(buyerId: string, orderId: string) {
    await this.db
      .getRepository(Order)
      .findOneByOrFail({ id: orderId, buyerId });
    return this.db.getRepository(HandoverCase).findOneByOrFail({ orderId });
  }
  async shopView(userId: string, shopId: string, orderId: string) {
    await this.db.getRepository(Order).findOneByOrFail({ id: orderId, shopId });
    return this.db.getRepository(HandoverCase).findOneByOrFail({ orderId });
  }
  async incidents(input: FulfillmentListInput = {}) {
    return this.db
      .getRepository(HandoverCase)
      .createQueryBuilder('handover')
      .where('handover.state != :closed', { closed: HANDOVER_STATE.CLOSED })
      .orderBy('handover.detectedAt', 'ASC')
      .take(100)
      .skip(input.offset ?? 0)
      .getMany();
  }

  async propose(adminId: string, orderId: string, input: HandoverProposal) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      const row = await manager.findOneByOrFail(HandoverCase, { orderId });
      const order = await manager.findOneByOrFail(Order, { id: orderId });
      const now = await this.now(manager);
      const deadline = new Date(input.deadline);
      const reviewUnavailable =
        row.state !== HANDOVER_STATE.REVIEW ||
        row.proposedDeadline ||
        !row.reviewDueAt ||
        row.reviewDueAt <= now;
      const orderIneligible =
        order.cancelState || !extendableOrderStates.includes(order.status);
      const extensionWindowInvalid =
        !Number.isFinite(deadline.getTime()) ||
        deadline.getTime() <=
          now.getTime() + FULFILLMENT_POLICY.BUYER_RESPONSE_MS ||
        deadline.getTime() >
          now.getTime() + FULFILLMENT_POLICY.MAX_EXTENSION_MS;
      const proposalUnavailable =
        reviewUnavailable || orderIneligible || extensionWindowInvalid;
      if (proposalUnavailable)
        throw new ConflictException(
          'A single valid extension within 24 hours is required',
        );
      row.state = HANDOVER_STATE.OFFERED;
      row.proposedDeadline = deadline;
      row.respondBy = new Date(
        now.getTime() + FULFILLMENT_POLICY.BUYER_RESPONSE_MS,
      );
      row.reason = input.reason;
      await this.audit(
        manager,
        row,
        HANDOVER_ACTION.PROPOSED,
        adminId,
        now,
        input.reason,
      );
      return manager.save(row);
    });
  }

  async respond(
    buyerId: string,
    orderId: string,
    { accept }: HandoverResponseInput,
  ) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      const order = await manager.findOneByOrFail(Order, {
        id: orderId,
        buyerId,
      });
      const row = await manager.findOneByOrFail(HandoverCase, { orderId });
      const now = await this.now(manager);
      const acceptanceAlreadyRecorded =
        row.consentedAt && accept && row.state === HANDOVER_STATE.CONSENTED;
      if (acceptanceAlreadyRecorded) return row;
      if (row.state !== HANDOVER_STATE.OFFERED)
        throw new ConflictException('No pending handover proposal');
      const proposalExpired =
        !row.respondBy ||
        row.respondBy <= now ||
        !row.proposedDeadline ||
        row.proposedDeadline <= now;
      if (proposalExpired) {
        await this.stop(
          manager,
          order,
          row,
          now,
          HANDOVER_STOP_REASON.BUYER_RESPONSE_TIMEOUT,
        );
        return row;
      }
      await this.audit(
        manager,
        row,
        accept ? HANDOVER_ACTION.BUYER_ACCEPTED : HANDOVER_ACTION.BUYER_REFUSED,
        buyerId,
        now,
        row.reason ?? 'Late handover',
      );
      if (!accept)
        await this.stop(
          manager,
          order,
          row,
          now,
          HANDOVER_ACTION.BUYER_REFUSED,
        );
      else {
        const orderIneligible =
          order.cancelState || !extendableOrderStates.includes(order.status);
        if (orderIneligible)
          throw new ConflictException('Order no longer eligible for extension');
        row.consentedAt = now;
        row.state = HANDOVER_STATE.CONSENTED;
        order.handoverBy = row.proposedDeadline;
        order.handoverReviewRequired = false;
        await manager.save(order);
        await manager.save(row);
      }
      return row;
    });
  }

  async adminStop(adminId: string, orderId: string, input: HandoverStop) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      const row = await manager.findOneByOrFail(HandoverCase, { orderId });
      const order = await manager.findOneByOrFail(Order, { id: orderId });
      if (!handoverReviewStates.includes(row.state))
        throw new ConflictException('No pending late handover review');
      const now = await this.now(manager);
      await this.audit(
        manager,
        row,
        HANDOVER_ACTION.ADMIN_STOPPED,
        adminId,
        now,
        input.reason,
      );
      row.events[row.events.length - 1].evidence = input.evidence;
      await this.stop(manager, order, row, now, HANDOVER_ACTION.ADMIN_STOPPED);
      return row;
    });
  }

  private async stop(
    manager: EntityManager,
    order: Order,
    row: HandoverCase,
    now: Date,
    reason: HandoverStopReason,
  ) {
    order.handoverReviewRequired = true;
    await this.audit(
      manager,
      row,
      HANDOVER_ACTION.SAFE_STOP,
      null,
      now,
      reason,
    );
    const shipment = await manager.findOneBy(Shipment, { orderId: order.id });
    order.cancelState = ORDER_CANCEL_STATE.APPROVED;
    order.cancelDecisionReason = reason;
    const unbookedOrderPreparing =
      !shipment && order.status === ORDER_STATUS.PREPARING;
    if (unbookedOrderPreparing) {
      await this.orderService.cancelCodVerified(manager, order, now);
      row.state = HANDOVER_STATE.CLOSED;
    } else if (shipment) {
      const pickupRequiresReturn =
        shipment.pickedObservedAt ||
        shipment.codCollectedAt ||
        shipment.carrierTransferredAt ||
        order.status !== ORDER_STATUS.PREPARING;
      if (pickupRequiresReturn) {
        shipment.returnRequestedAt ??= now;
        shipment.reviewReason =
          SHIPMENT_REVIEW_REASON.LATE_HANDOVER_RETURN_REQUIRED;
        row.state = HANDOVER_STATE.RETURN_PENDING;
      } else {
        shipment.cancelRequestedAt ??= now;
        shipment.state = SHIPMENT_STATE.CANCEL_PENDING;
        row.state = HANDOVER_STATE.CANCEL_PENDING;
      }
      shipment.nextQueryAt = now;
      await manager.save(shipment);
      await manager.save(order);
    } else {
      row.state = HANDOVER_STATE.RETURN_PENDING;
      await manager.save(order);
    }
    await manager.save(row);
  }

  async run() {
    const [{ now: clock }] = await this.db.query(
      'SELECT clock_timestamp() AS now',
    );
    const now = new Date(clock);
    const candidates = await this.db
      .getRepository(Order)
      .createQueryBuilder('o')
      .where(
        'o.paymentMethod = :method AND (o.status = :status OR (o.status = :shipping AND o.handoverReviewRequired = true)) AND o.handoverBy <= :now',
        {
          method: ORDER_PAYMENT_METHOD.COD,
          status: ORDER_STATUS.PREPARING,
          shipping: ORDER_STATUS.SHIPPING,
          now,
        },
      )
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM handover_cases existing WHERE existing."orderId" = o.id)',
      )
      .orderBy('o.handoverBy', 'ASC')
      .take(100)
      .getMany();
    const open = await this.db
      .getRepository(HandoverCase)
      .createQueryBuilder('c')
      .where('c.state != :closed', { closed: HANDOVER_STATE.CLOSED })
      .orderBy('c.updatedAt', 'ASC')
      .take(100)
      .getMany();
    for (const id of new Set([
      ...candidates.map((o) => o.id),
      ...open.map((c) => c.orderId),
    ])) {
      try {
        await this.db.transaction(async (manager) => {
          await this.lock(manager);
          await this.reconcileHandover(manager, id);
        });
      } catch {
        this.logger.warn({
          orderId: id,
          message: 'Late handover requires reconciliation',
        });
      }
    }
  }
  private async reconcileHandover(manager: EntityManager, id: string) {
    const order = await manager.findOneByOrFail(Order, { id });
    const now = await this.now(manager);
    const shipment = await manager.findOneBy(Shipment, { orderId: id });
    let row = await manager.findOneBy(HandoverCase, { orderId: id });
    if (!row)
      row = await this.openHandoverReview(manager, order, shipment, id, now);
    if (!row) return;
    await this.advanceHandoverCase(manager, order, shipment, row, now);
  }

  private async advanceHandoverCase(
    manager: EntityManager,
    order: Order,
    shipment: Shipment | null,
    row: HandoverCase,
    now: Date,
  ) {
    if (row.state === HANDOVER_STATE.CLOSED) return;
    const buyerResponseExpired =
      row.state === HANDOVER_STATE.OFFERED &&
      row.respondBy &&
      (row.respondBy <= now ||
        (row.proposedDeadline && row.proposedDeadline <= now));
    if (order.status === ORDER_STATUS.CANCELLED) {
      row.state = HANDOVER_STATE.CLOSED;
      await this.audit(
        manager,
        row,
        HANDOVER_ACTION.CLOSED,
        null,
        now,
        'Order cancellation verified',
      );
    } else if (row.state === HANDOVER_STATE.REVIEW) {
      if (!row.reviewDueAt) {
        row.reviewDueAt = await fulfillmentDeadline(manager, row.detectedAt, 2);
        row.calendarMissing = !row.reviewDueAt;
      }
      const adminReviewExpired = row.reviewDueAt && row.reviewDueAt <= now;
      if (adminReviewExpired)
        await this.stop(
          manager,
          order,
          row,
          now,
          HANDOVER_STOP_REASON.ADMIN_REVIEW_TIMEOUT,
        );
    } else if (buyerResponseExpired)
      await this.stop(
        manager,
        order,
        row,
        now,
        HANDOVER_STOP_REASON.BUYER_RESPONSE_TIMEOUT,
      );
    else if (row.state === HANDOVER_STATE.CONSENTED) {
      const pickupWithinExtension =
        shipment?.pickedObservedAt &&
        order.handoverBy &&
        shipment.pickedObservedAt <= order.handoverBy;
      if (pickupWithinExtension) {
        row.state = HANDOVER_STATE.CLOSED;
        await this.audit(
          manager,
          row,
          HANDOVER_ACTION.PICKUP_VERIFIED,
          null,
          now,
          'Carrier pickup observed after buyer consent',
        );
      } else {
        const extensionExpired = order.handoverBy && order.handoverBy <= now;
        if (extensionExpired)
          await this.stop(
            manager,
            order,
            row,
            now,
            HANDOVER_STOP_REASON.EXTENSION_EXHAUSTED,
          );
      }
    }
    row.updatedAt = now;
    await manager.save(row);
  }

  private async openHandoverReview(
    manager: EntityManager,
    order: Order,
    shipment: Shipment | null,
    id: string,
    now: Date,
  ) {
    const reviewNotRequired =
      !extendableOrderStates.includes(order.status) ||
      !order.handoverBy ||
      order.handoverBy > now ||
      (shipment?.pickedObservedAt && !order.handoverReviewRequired);
    if (reviewNotRequired) return null;
    const reviewDueAt = await fulfillmentDeadline(
      manager,
      now,
      FULFILLMENT_POLICY.HANDOVER_ADMIN_BUSINESS_DAYS,
    );
    const row = manager.create(HandoverCase, {
      orderId: id,
      state: HANDOVER_STATE.REVIEW,
      detectedAt: now,
      reviewDueAt,
      calendarMissing: !reviewDueAt,
      events: [],
    });
    await this.audit(
      manager,
      row,
      HANDOVER_ACTION.OVERDUE,
      null,
      now,
      'Carrier pickup not verified within 48 hours',
    );
    order.handoverReviewRequired = true;
    await manager.save(order);
    await manager.save(row);
    return row;
  }
}
