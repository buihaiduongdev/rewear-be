import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import {
  ORDER_CANCEL_STATE,
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import { Order, OrderEvent } from '@/modules/order/entities';
import { OrderService } from '@/modules/order/order.service';
import type { RejectOrderInput } from '@/modules/order/schemas/order.schema';

import { FULFILLMENT_POLICY } from './constants/fulfillment.constant';
import {
  SHIPMENT_REVIEW_REASON,
  SHIPMENT_STATE,
} from './constants/shipment.constant';
import { Shipment } from './entities/shipment.entity';
import type { CancellationDecision } from './schemas/shipment.schema';

@Injectable()
export class ShipmentCancellationService {
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

  async request(buyerId: string, id: string) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      const order = await manager.findOneByOrFail(Order, {
        id,
        buyerId,
        paymentMethod: ORDER_PAYMENT_METHOD.COD,
      });
      if (order.cancelRequestedAt) return order;
      const shipment = await manager.findOneBy(Shipment, { orderId: id });
      if (order.status !== ORDER_STATUS.PREPARING || shipment?.pickedObservedAt)
        throw new ConflictException(
          'Cancellation request is only available before handover',
        );
      const now = await this.now(manager);
      order.cancelState = ORDER_CANCEL_STATE.PENDING;
      order.cancelRequestedAt = now;
      order.cancelRespondBy = new Date(
        now.getTime() + FULFILLMENT_POLICY.CANCELLATION_RESPONSE_MS,
      );
      await this.audit(
        manager,
        order,
        ORDER_EVENT_ACTION.CANCEL_REQUESTED,
        buyerId,
        null,
        null,
      );
      return manager.save(order);
    });
  }

  async respond(
    userId: string,
    shopId: string,
    id: string,
    input: CancellationDecision,
  ) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);

      const order = await manager.findOneByOrFail(Order, {
        id,
        shopId,
        paymentMethod: ORDER_PAYMENT_METHOD.COD,
      });
      if (order.cancelState !== ORDER_CANCEL_STATE.PENDING) return order;
      const now = await this.now(manager);
      const expired = !!(order.cancelRespondBy && order.cancelRespondBy <= now);
      order.cancelDecisionReason = expired
        ? 'Seller response deadline expired'
        : input.reason;
      order.cancelDecisionEvidence = expired ? null : input.evidence;
      await this.audit(
        manager,
        order,
        ORDER_EVENT_ACTION.CANCEL_DECISION,
        expired ? null : userId,
        order.cancelDecisionReason,
        order.cancelDecisionEvidence,
        expired || input.approve,
      );
      if (input.approve || expired) await this.approve(manager, order, now);
      else {
        order.cancelState = ORDER_CANCEL_STATE.REJECTED;
        order.cancelReviewUntil = new Date(
          now.getTime() + FULFILLMENT_POLICY.CANCELLATION_REVIEW_MS,
        );
        await manager.save(order);
      }
      return order;
    });
  }

  async requestReview(
    buyerId: string,
    id: string,
    { reason }: RejectOrderInput,
  ) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      const order = await manager.findOneByOrFail(Order, {
        id,
        buyerId,
        paymentMethod: ORDER_PAYMENT_METHOD.COD,
      });
      if (order.cancelState === ORDER_CANCEL_STATE.ADMIN_REVIEW) return order;
      const now = await this.now(manager);
      if (
        order.cancelState !== ORDER_CANCEL_STATE.REJECTED ||
        !order.cancelReviewUntil ||
        order.cancelReviewUntil <= now
      )
        throw new ConflictException('Cancellation review window has closed');
      order.cancelState = ORDER_CANCEL_STATE.ADMIN_REVIEW;
      order.cancelDecisionReason = reason;
      await this.audit(
        manager,
        order,
        ORDER_EVENT_ACTION.CANCEL_REVIEW_REQUESTED,
        buyerId,
        reason,
        null,
      );
      return manager.save(order);
    });
  }

  async adminDecision(
    adminId: string,
    id: string,
    input: CancellationDecision,
  ) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      const order = await manager.findOneByOrFail(Order, {
        id,
        paymentMethod: ORDER_PAYMENT_METHOD.COD,
      });
      if (order.cancelState !== ORDER_CANCEL_STATE.ADMIN_REVIEW)
        throw new ConflictException('No pending cancellation review');
      const now = await this.now(manager);
      order.cancelDecisionReason = input.reason;
      order.cancelDecisionEvidence = input.evidence;
      await this.audit(
        manager,
        order,
        ORDER_EVENT_ACTION.CANCEL_REVIEW_DECIDED,
        adminId,
        input.reason,
        input.evidence,
        input.approve,
      );
      if (input.approve) await this.approve(manager, order, now);
      else {
        order.cancelState = ORDER_CANCEL_STATE.REJECTED;
        order.cancelReviewUntil = now;
        await manager.save(order);
      }
      return order;
    });
  }

  private async approve(manager: EntityManager, order: Order, now: Date) {
    order.cancelState = ORDER_CANCEL_STATE.APPROVED;
    const shipment = await manager.findOneBy(Shipment, { orderId: order.id });
    if (!shipment) {
      await this.orderService.cancelCodVerified(manager, order, now);
      return;
    }
    shipment.cancelRequestedAt ??= now;
    shipment.state = SHIPMENT_STATE.CANCEL_PENDING;
    shipment.nextQueryAt = now;
    if (shipment.pickedObservedAt)
      shipment.reviewReason = SHIPMENT_REVIEW_REASON.PICKED_DURING_CANCELLATION;
    await manager.save(order);
    await manager.save(shipment);
  }

  private async audit(
    manager: EntityManager,
    order: Order,
    action: OrderEvent['action'],
    actorId: string | null,
    reason: string | null,
    evidence: string | null,
    approved: boolean | null = null,
  ) {
    await manager.save(
      OrderEvent,
      manager.create(OrderEvent, {
        orderId: order.id,
        action,
        actorId,
        reason,
        evidence,
        approved,
      }),
    );
  }

  async run() {
    const [{ now: clock }] = await this.db.query(
      'SELECT clock_timestamp() AS now',
    );
    const due = await this.db
      .getRepository(Order)
      .createQueryBuilder('order')
      .where('order.paymentMethod = :method', {
        method: ORDER_PAYMENT_METHOD.COD,
      })
      .andWhere('order.cancelState = :state', {
        state: ORDER_CANCEL_STATE.PENDING,
      })
      .andWhere('order.cancelRespondBy <= :now', { now: clock })
      .take(100)
      .getMany();
    for (const item of due)
      await this.db.transaction(async (manager) => {
        await this.lock(manager);
        const order = await manager.findOneByOrFail(Order, { id: item.id });
        const now = await this.now(manager);
        if (
          order.cancelState === ORDER_CANCEL_STATE.PENDING &&
          order.cancelRespondBy &&
          order.cancelRespondBy <= now
        ) {
          order.cancelDecisionReason = 'Seller response deadline expired';
          await this.audit(
            manager,
            order,
            ORDER_EVENT_ACTION.CANCEL_DECISION,
            null,
            order.cancelDecisionReason,
            null,
            true,
          );
          await this.approve(manager, order, now);
        }
      });
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
          now: clock,
        },
      )
      .execute();
  }
}
