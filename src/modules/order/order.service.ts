import {
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { Category } from '@/modules/category/entities';
import { CodPolicy } from '@/modules/cod/policies/cod.policy';
import { CoinService } from '@/modules/coins/coin.service';
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxService } from '@/modules/event/outbox.service';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import {
  SHIPMENT_STATE,
  UNSAFE_CARRIER_REVIEW_REASONS,
} from '@/modules/shipment/constants/shipment.constant';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopMemberRole, ShopStatus } from '@/modules/shop/enums';
import { WalletCredit } from '@/modules/wallet/entities';
import { WalletService } from '@/modules/wallet/wallet.service';

import {
  ORDER_CANCEL_STATE,
  ORDER_CANCELLATION_REASON,
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
  ORDER_POLICY,
  ORDER_STATUS,
} from './constants/order.constant';
import { Order, OrderEvent } from './entities';
import type { OrderListInput, RejectOrderInput } from './schemas/order.schema';

export async function assertShopOrderManager(
  manager: EntityManager,
  userId: string,
  shopId: string,
  lock = false,
): Promise<void> {
  const member = await manager.findOne(ShopMember, {
    where: {
      shopId,
      userId,
      memberRole: ShopMemberRole.OWNER,
    },
    lock: lock ? { mode: 'pessimistic_read' } : undefined,
  });
  if (!member) {
    throw new ForbiddenException('Shop order management access required');
  }
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly db: DataSource,
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => CodPolicy))
    private readonly codPolicy: CodPolicy,
    private readonly outboxService: OutboxService,
    private readonly coinService: CoinService,
  ) {}

  buyerList(buyerId: string, input: OrderListInput) {
    return this.list(this.db.manager, { buyerId }, input);
  }

  async buyerDetail(buyerId: string, id: string) {
    return this.detail(
      this.db.manager,
      await this.db.getRepository(Order).findOneByOrFail({ id, buyerId }),
    );
  }

  async shopList(_userId: string, shopId: string, input: OrderListInput) {
    return this.list(this.db.manager, { shopId }, input);
  }

  async shopDetail(_userId: string, shopId: string, id: string) {
    return this.detail(
      this.db.manager,
      await this.db.getRepository(Order).findOneByOrFail({ id, shopId }),
    );
  }

  private list(
    manager: EntityManager,
    scope: { buyerId?: string; shopId?: string },
    input: OrderListInput,
  ) {
    return manager.find(Order, {
      where: { ...scope, ...(input.status ? { status: input.status } : {}) },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: input.limit ?? 100,
      skip: input.offset ?? 0,
    });
  }

  async accept(userId: string, shopId: string, id: string) {
    const result = await this.db.transaction(async (manager) => {
      const order = await manager.findOneOrFail(Order, {
        where: { id, shopId },
        lock: { mode: 'pessimistic_write' },
      });
      if (order.status === ORDER_STATUS.PREPARING)
        return { order, expired: false };
      if (order.status !== ORDER_STATUS.PENDING)
        throw new ConflictException('Order is no longer awaiting confirmation');
      const now = await this.now(manager);
      if (order.sellerConfirmBy <= now) {
        await this.cancel(
          manager,
          order,
          now,
          ORDER_CANCELLATION_REASON.SELLER_CONFIRM_TIMEOUT,
          null,
          null,
        );
        return { order, expired: true };
      }
      order.status = ORDER_STATUS.PREPARING;
      order.acceptedAt = now;
      if (order.paymentMethod === ORDER_PAYMENT_METHOD.COD)
        order.handoverBy = new Date(
          now.getTime() + ORDER_POLICY.HANDOVER_WINDOW_MS,
        );
      await manager.save(order);
      const event = await manager.save(
        OrderEvent,
        manager.create(OrderEvent, {
          orderId: id,
          action: ORDER_EVENT_ACTION.ACCEPTED,
          actorId: userId,
          reason: null,
          createdAt: now,
        }),
      );
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
      return { order, expired: false };
    });
    if (result.expired)
      throw new ConflictException(
        'Seller confirmation deadline has passed; order cancelled and refunded',
      );
    return this.detail(this.db.manager, result.order);
  }

  async reject(
    userId: string,
    shopId: string,
    id: string,
    { reason }: RejectOrderInput,
  ) {
    const order = await this.db.transaction(async (manager) => {
      const order = await manager.findOneOrFail(Order, {
        where: { id, shopId },
        lock: { mode: 'pessimistic_write' },
      });
      if (order.status === ORDER_STATUS.CANCELLED) return order;
      if (order.status !== ORDER_STATUS.PENDING)
        throw new ConflictException('Order is no longer awaiting confirmation');
      const now = await this.now(manager);
      const expired = order.sellerConfirmBy <= now;
      await this.cancel(
        manager,
        order,
        now,
        expired
          ? ORDER_CANCELLATION_REASON.SELLER_CONFIRM_TIMEOUT
          : ORDER_CANCELLATION_REASON.SELLER_REJECTED,
        expired ? null : userId,
        expired ? null : reason,
      );
      return order;
    });
    return this.detail(this.db.manager, order);
  }

  async expireDue() {
    const [{ now }] = await this.db.query('SELECT clock_timestamp() AS now');
    const due = await this.db
      .getRepository(Order)
      .createQueryBuilder('order')
      .where('order.status = :status', { status: ORDER_STATUS.PENDING })
      .andWhere('order.sellerConfirmBy <= :now', { now: new Date(now) })
      .andWhere('(order.expiryRetryAt IS NULL OR order.expiryRetryAt <= :now)')
      .orderBy('order.sellerConfirmBy', 'ASC')
      .addOrderBy('order.id', 'ASC')
      .take(100)
      .getMany();
    let expired = 0;
    for (const item of due) {
      try {
        expired += await this.db.transaction(async (manager) => {
          const order = await manager.findOneOrFail(Order, {
            where: { id: item.id },
            lock: { mode: 'pessimistic_write' },
          });
          const now = await this.now(manager);
          if (
            order.status !== ORDER_STATUS.PENDING ||
            order.sellerConfirmBy > now
          )
            return 0;
          await this.cancel(
            manager,
            order,
            now,
            ORDER_CANCELLATION_REASON.SELLER_CONFIRM_TIMEOUT,
            null,
            null,
          );
          return 1;
        });
      } catch {
        await this.db.getRepository(Order).update(
          { id: item.id, status: ORDER_STATUS.PENDING },
          {
            expiryRetryAt: new Date(Date.now() + ORDER_POLICY.EXPIRY_RETRY_MS),
          },
        );
        this.logger.error({
          orderId: item.id,
          message: 'Order expiry/refund failed; rolled back, retry required',
        });
      }
    }
    return expired;
  }

  async cancelCodPending(buyerId: string, id: string) {
    const order = await this.db.transaction(async (manager) => {
      const order = await manager.findOneOrFail(Order, {
        where: { id, buyerId, paymentMethod: ORDER_PAYMENT_METHOD.COD },
        lock: { mode: 'pessimistic_write' },
      });
      if (order.status === ORDER_STATUS.CANCELLED) return order;
      const now = await this.now(manager);
      if (order.status === ORDER_STATUS.PENDING) {
        const expired = order.sellerConfirmBy <= now;
        await this.cancel(
          manager,
          order,
          now,
          expired
            ? ORDER_CANCELLATION_REASON.SELLER_CONFIRM_TIMEOUT
            : ORDER_CANCELLATION_REASON.BUYER_CANCELLED,
          expired ? null : buyerId,
          expired ? null : 'Buyer changed their mind',
        );
        if (!expired)
          await this.codPolicy.recordBuyerCancellation(manager, order, now);
        return order;
      }
      const shipment = await manager.findOne(Shipment, {
        where: { orderId: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        order.status !== ORDER_STATUS.PREPARING ||
        shipment?.pickedObservedAt
      ) {
        throw new ConflictException(
          'COD cancellation is only available before carrier pickup',
        );
      }
      if (!shipment) {
        order.cancelState = ORDER_CANCEL_STATE.APPROVED;
        await this.cancelCodVerified(manager, order, now);
        await this.codPolicy.recordBuyerCancellation(manager, order, now);
        return order;
      }
      if (order.cancelState === ORDER_CANCEL_STATE.APPROVED) return order;
      order.cancelState = ORDER_CANCEL_STATE.APPROVED;
      order.cancelRequestedAt ??= now;
      shipment.cancelRequestedAt ??= now;
      shipment.state = SHIPMENT_STATE.CANCEL_PENDING;
      shipment.nextQueryAt = now;
      await manager.save(order);
      await manager.save(shipment);
      const event = await manager.save(
        OrderEvent,
        manager.create(OrderEvent, {
          orderId: order.id,
          action: ORDER_EVENT_ACTION.CANCEL_REQUESTED,
          actorId: buyerId,
          reason: 'Buyer requested pre-handover cancellation',
          createdAt: now,
        }),
      );
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
      await this.codPolicy.recordBuyerCancellation(manager, order, now);
      return order;
    });
    return this.detail(this.db.manager, order);
  }

  async cancelCodVerified(manager: EntityManager, order: Order, now: Date) {
    const codCancellationIsUnsafe =
      order.paymentMethod !== ORDER_PAYMENT_METHOD.COD ||
      order.status !== ORDER_STATUS.PREPARING ||
      order.cancelState !== ORDER_CANCEL_STATE.APPROVED;
    if (codCancellationIsUnsafe)
      throw new ConflictException(
        'COD cancellation requires approval and safe carrier state',
      );
    await this.cancel(
      manager,
      order,
      now,
      ORDER_CANCELLATION_REASON.BUYER_CANCEL_APPROVED,
      null,
      'Cancelled before carrier pickup',
    );
    order.cancelState = ORDER_CANCEL_STATE.CLOSED;
    await manager.save(order);
  }

  async releaseCodReturnedVerified(
    manager: EntityManager,
    order: Order,
    now: Date,
    sellable = true,
    actorId: string | null = null,
  ) {
    const shipment = await manager.findOne(Shipment, {
      where: { orderId: order.id },
      lock: { mode: 'pessimistic_write' },
    });
    const codReturnIsUnverified =
      order.paymentMethod !== ORDER_PAYMENT_METHOD.COD ||
      order.status !== ORDER_STATUS.RETURNS ||
      !order.carrierReturnedAt ||
      order.deliveryObservedAt ||
      shipment?.providerStatus !== 'returned' ||
      shipment.codCollectedAt ||
      shipment.carrierTransferredAt ||
      (shipment.reviewReason &&
        UNSAFE_CARRIER_REVIEW_REASONS.includes(shipment.reviewReason));
    if (codReturnIsUnverified)
      throw new ConflictException('Verified uncollected COD return required');
    await this.coinService.releaseOrderCoins(manager, order, 'SELLER', now);
    order.stockReleaseReviewIds = await this.releaseStock(
      manager,
      order,
      sellable,
    );
    order.status = ORDER_STATUS.CANCELLED;
    order.cancelledAt = now;
    order.cancellationReason = ORDER_CANCELLATION_REASON.CARRIER_RETURNED;
    order.cancelState = ORDER_CANCEL_STATE.CLOSED;
    shipment.reviewReason = null;
    shipment.nextQueryAt = null;
    await manager.save(shipment);
    await manager.save(order);
    const event = await manager.save(
      OrderEvent,
      manager.create(OrderEvent, {
        orderId: order.id,
        action: ORDER_EVENT_ACTION.CANCEL_APPROVED,
        actorId,
        reason: order.cancellationNote ?? 'Returned by carrier',
        createdAt: now,
      }),
    );
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

  private async now(manager: EntityManager) {
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }

  private async cancel(
    manager: EntityManager,
    order: Order,
    now: Date,
    reason: NonNullable<Order['cancellationReason']>,
    actorId: string | null,
    note: string | null,
  ) {
    if (order.paymentMethod !== ORDER_PAYMENT_METHOD.COD)
      await this.walletService.creditCancellation(manager, order);
    else {
      const buyerCancellation =
        reason === ORDER_CANCELLATION_REASON.BUYER_CANCELLED ||
        reason === ORDER_CANCELLATION_REASON.BUYER_CANCEL_APPROVED;
      await this.coinService.releaseOrderCoins(
        manager,
        order,
        buyerCancellation ? 'BUYER_CHANGE' : 'SELLER',
        now,
      );
    }
    order.stockReleaseReviewIds = await this.releaseStock(manager, order);
    order.status = ORDER_STATUS.CANCELLED;
    order.cancelledAt = now;
    order.cancellationReason = reason;
    order.cancellationNote = note;
    await manager.save(order);
    const event = await manager.save(
      OrderEvent,
      manager.create(OrderEvent, {
        orderId: order.id,
        action:
          reason === ORDER_CANCELLATION_REASON.SELLER_REJECTED
            ? ORDER_EVENT_ACTION.REJECTED
            : reason === ORDER_CANCELLATION_REASON.BUYER_CANCELLED
              ? ORDER_EVENT_ACTION.BUYER_CANCELLED
              : reason === ORDER_CANCELLATION_REASON.BUYER_CANCEL_APPROVED
                ? ORDER_EVENT_ACTION.CANCEL_APPROVED
                : ORDER_EVENT_ACTION.EXPIRED,
        actorId,
        reason: note,
        createdAt: now,
      }),
    );
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

  private async releaseStock(
    manager: EntityManager,
    order: Order,
    sellable = true,
  ) {
    const ids = [...new Set(order.items.map((item) => item.productId))].sort();
    if (!ids.length) return [];
    const products = await manager.find(Product, {
      where: { id: In(ids) },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    const { approvedIds, categories, shop } =
      await this.stockReleaseEligibility(manager, order, ids, products);
    const review: string[] = [];
    const updates: {
      id: string;
      status: ProductStatus;
      clearTimestamps: boolean;
      clearReservedOrder: boolean;
    }[] = [];

    for (const id of ids) {
      const product = products.find((item) => item.id === id);
      const codOwned =
        order.paymentMethod === ORDER_PAYMENT_METHOD.COD &&
        product?.reservedOrderId === order.id &&
        product.status === ProductStatus.HELD;
      const requiresStockReview =
        !product ||
        (!codOwned && product.soldOrderId !== order.id) ||
        (product.reservedOrderId && product.reservedOrderId !== order.id) ||
        (product.soldOrderId && product.soldOrderId !== order.id) ||
        product.reservationId ||
        product.shopId !== order.shopId ||
        (!codOwned && product.status === ProductStatus.HELD);
      if (requiresStockReview) {
        review.push(id);
        continue;
      }
      let targetStatus = product.status;
      let clearTimestamps = false;
      if (product.status === ProductStatus.SOLD || codOwned) {
        const eligible =
          sellable &&
          shop?.status === ShopStatus.ACTIVE &&
          product.categoryId &&
          categories.get(product.categoryId)?.isActive &&
          approvedIds.has(product.id);
        targetStatus = eligible ? ProductStatus.ACTIVE : ProductStatus.HIDDEN;
        clearTimestamps = true;
      }
      updates.push({
        id: product.id,
        status: targetStatus,
        clearTimestamps,
        clearReservedOrder: !!codOwned,
      });
    }

    if (updates.length > 0) {
      await manager.query(
        `
        UPDATE products AS p
        SET status = u.new_status::"products_status_enum",
            "soldAt" = CASE WHEN u.clear_timestamps THEN NULL ELSE p."soldAt" END,
            "heldUntil" = CASE WHEN u.clear_timestamps THEN NULL ELSE p."heldUntil" END,
            "soldOrderId" = NULL,
            "reservedOrderId" = CASE WHEN u.clear_reserved THEN NULL ELSE p."reservedOrderId" END,
            "updatedAt" = NOW()
        FROM (
          SELECT * FROM unnest(
            $1::uuid[],
            $2::varchar[],
            $3::boolean[],
            $4::boolean[]
          ) AS t(id, new_status, clear_timestamps, clear_reserved)
        ) AS u
        WHERE p.id = u.id
        `,
        [
          updates.map((u) => u.id),
          updates.map((u) => u.status),
          updates.map((u) => u.clearTimestamps),
          updates.map((u) => u.clearReservedOrder),
        ],
      );
    }
    return review;
  }

  private async stockReleaseEligibility(
    manager: EntityManager,
    order: Order,
    ids: string[],
    products: Product[],
  ) {
    const moderations = await manager.find(ProductModeration, {
      where: { productId: In(ids) },
      order: { productId: 'ASC' },
      lock: { mode: 'pessimistic_read' },
    });
    const approvedIds = new Set(
      moderations
        .filter(
          (moderation) =>
            moderation.status === ProductModerationStatus.APPROVED,
        )
        .map((moderation) => moderation.productId),
    );
    const categoryIds = [
      ...new Set(
        products.flatMap((product) =>
          product.categoryId ? [product.categoryId] : [],
        ),
      ),
    ].sort();
    const categories = new Map<string, Category>();
    if (categoryIds.length > 0) {
      const categoryRows = await manager.find(Category, {
        where: { id: In(categoryIds) },
        lock: { mode: 'pessimistic_read' },
      });
      for (const category of categoryRows) {
        categories.set(category.id, category);
      }
    }
    const shop = await manager.findOne(Shop, {
      where: { id: order.shopId },
      lock: { mode: 'pessimistic_read' },
    });
    return { approvedIds, categories, shop };
  }

  private async detail(manager: EntityManager, order: Order) {
    const events = await manager.find(OrderEvent, {
      where: { orderId: order.id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const credit = await manager.findOneBy(WalletCredit, { orderId: order.id });
    return {
      ...order,
      events,
      walletRefund: credit
        ? { id: credit.id, amount: credit.amount, creditedAt: credit.createdAt }
        : null,
    };
  }
}
