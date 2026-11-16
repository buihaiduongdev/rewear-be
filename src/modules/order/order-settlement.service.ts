import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { requiresFulfillmentReview } from '@/modules/cod-reconciliation/policies/cod-funding.policy';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShopSettlement } from '@/modules/shop-finance/entities/shop-settlement.entity';

import {
  ORDER_EVENT_ACTION,
  ORDER_POLICY,
  ORDER_STATUS,
} from './constants/order.constant';
import { OrderDeliveryVerification } from './entities/order-delivery-verification.entity';
import { Order, OrderEvent } from './entities/order.entity';
import { OrderFundingService } from './order-funding.service';
import { isSettlementWindowDue } from './policies/order-settlement.policy';
import { verifyDeliverySchema } from './schemas/order-settlement.schema';
import type { VerifyDeliveryInput } from './types/order-settlement.type';

const receiptStates = [ORDER_STATUS.DELIVERED, ORDER_STATUS.COMPLETED];

@Injectable()
export class OrderSettlementService {
  private readonly logger = new Logger(OrderSettlementService.name);
  private cursor: string | undefined;
  constructor(
    private readonly db: DataSource,
    private readonly funding: OrderFundingService,
  ) {}

  private async lock(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }

  async confirmReceipt(buyerId: string, orderId: string) {
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const order = await manager.findOneByOrFail(Order, {
        id: orderId,
        buyerId,
      });
      if (order.receiptConfirmedAt) return order;
      const shipment = await manager.findOneBy(Shipment, { orderId });
      const canConfirm =
        receiptStates.includes(
          order.status as (typeof receiptStates)[number],
        ) &&
        shipment &&
        !requiresFulfillmentReview(order, shipment, now);
      if (!canConfirm)
        throw new ConflictException(
          'Verified delivery is required to confirm receipt',
        );
      order.receiptConfirmedAt = now;
      order.status = ORDER_STATUS.COMPLETED;
      await manager.save(order);
      await this.event(
        manager,
        orderId,
        ORDER_EVENT_ACTION.RECEIPT_CONFIRMED,
        now,
        buyerId,
      );
      return order;
    });
  }

  async verifyDelivery(
    adminId: string,
    orderId: string,
    input: VerifyDeliveryInput,
  ) {
    const data = verifyDeliverySchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const order = await manager.findOneByOrFail(Order, { id: orderId });
      const deliveredAt = new Date(data.deliveredAt);
      const existing = await manager.findOneBy(OrderDeliveryVerification, {
        orderId,
      });
      if (existing) {
        const isSameVerification =
          existing.deliveredAt.getTime() === deliveredAt.getTime() &&
          existing.mode === data.mode &&
          existing.reason === data.reason &&
          existing.evidence === data.evidence;
        if (!isSameVerification)
          throw new ConflictException(
            'Delivery verification is immutable; review required',
          );
        return order;
      }
      const shipment = await manager.findOneBy(Shipment, { orderId });
      const invalidTimestamp =
        deliveredAt > now ||
        deliveredAt < order.createdAt ||
        Boolean(
          order.deliveryObservedAt && deliveredAt > order.deliveryObservedAt,
        );
      const canVerify =
        shipment &&
        !requiresFulfillmentReview(order, shipment, now) &&
        !invalidTimestamp;
      if (!canVerify)
        throw new ConflictException(
          'Delivery timestamp or carrier evidence requires review',
        );
      const deadline = new Date(
        deliveredAt.getTime() + ORDER_POLICY.DISPUTE_WINDOW_MS,
      );
      await manager.save(
        OrderDeliveryVerification,
        manager.create(OrderDeliveryVerification, {
          orderId,
          actorId: adminId,
          deliveredAt,
          disputeDeadlineAt: deadline,
          mode: data.mode,
          reason: data.reason,
          evidence: data.evidence,
        }),
      );
      order.deliveryVerifiedAt = deliveredAt;
      order.disputeDeadlineAt = deadline;
      await manager.save(order);
      // Private evidence stays in the verification table, never in buyer-facing events.
      await this.event(
        manager,
        orderId,
        ORDER_EVENT_ACTION.DELIVERY_VERIFIED,
        now,
        adminId,
      );
      return order;
    });
  }

  async settleOrder(orderId: string) {
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const existing = await manager.findOneBy(ShopSettlement, { orderId });
      if (existing) return existing;
      const order = await manager.findOneByOrFail(Order, { id: orderId });
      const shipment = await manager.findOneBy(Shipment, { orderId });
      const canConsider =
        receiptStates.includes(
          order.status as (typeof receiptStates)[number],
        ) &&
        shipment &&
        !requiresFulfillmentReview(order, shipment, now);
      if (!canConsider) return null;
      const verification = await manager.findOneBy(OrderDeliveryVerification, {
        orderId,
      });
      const windowDue = isSettlementWindowDue(order, verification, now);
      if (windowDue && order.status === ORDER_STATUS.DELIVERED) {
        order.status = ORDER_STATUS.COMPLETED;
        await manager.save(order);
        await this.event(
          manager,
          orderId,
          ORDER_EVENT_ACTION.COMPLETED,
          now,
          null,
        );
      }
      // Completion is a delivery outcome, independent of carrier remittance.
      const credit = await this.funding.heldCredit(manager, order, shipment);
      if (!credit) return null;
      const canRelease = windowDue && verification?.mode === credit.mode;
      if (!canRelease) return null;
      const release = await manager.save(
        ShopSettlement,
        manager.create(ShopSettlement, {
          orderId,
          shopId: order.shopId,
          creditId: credit.id,
          amount: credit.amount,
          mode: credit.mode,
          createdAt: now,
        }),
      );
      order.status = ORDER_STATUS.COMPLETED;
      await manager.save(order);
      await this.event(manager, orderId, ORDER_EVENT_ACTION.SETTLED, now, null);
      return release;
    });
  }

  async settleDue() {
    // Keyset traversal visits blocked and failing rows without starving later orders.
    const candidates = this.db.manager
      .createQueryBuilder(Order, 'order')
      .select('order.id', 'id')
      .where('order.status IN (:...states)', { states: receiptStates })
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM shop_settlements release WHERE release."orderId" = order.id)',
      )
      .orderBy('order.id', 'ASC')
      .limit(ORDER_POLICY.SETTLEMENT_BATCH_SIZE);
    if (this.cursor)
      candidates.andWhere('order.id > :cursor', { cursor: this.cursor });
    const orders = await candidates.getRawMany<{ id: string }>();
    for (const order of orders) {
      this.cursor = order.id;
      try {
        await this.settleOrder(order.id);
      } catch {
        this.logger.error({
          orderId: order.id,
          message: 'Settlement rolled back; retry on next scan',
        });
      }
    }
    if (orders.length < ORDER_POLICY.SETTLEMENT_BATCH_SIZE)
      this.cursor = undefined;
  }

  private async event(
    manager: EntityManager,
    orderId: string,
    action: OrderEvent['action'],
    now: Date,
    actorId: string | null,
  ) {
    await manager.save(
      OrderEvent,
      manager.create(OrderEvent, {
        orderId,
        action,
        actorId,
        reason: null,
        evidence: null,
        approved: null,
        createdAt: now,
      }),
    );
  }
}
