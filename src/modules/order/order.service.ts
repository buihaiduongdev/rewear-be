import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { Category } from '@/modules/category/entities';
import { CodPolicy } from '@/modules/cod/cod.policy';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';
import { WalletCredit } from '@/modules/wallet/wallet.entity';
import { WalletService } from '@/modules/wallet/wallet.service';

import { OrderAccess } from './order.access';
import {
  ORDER_CANCEL_STATE,
  ORDER_CANCELLATION_REASON,
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from './order.constants';
import { Order, OrderEvent } from './order.entity';
import type { OrderListInput } from './order.type';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  constructor(
    private readonly db: DataSource,
    private readonly access: OrderAccess,
    private readonly wallet: WalletService,
    private readonly codPolicy: CodPolicy,
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

  async shopList(userId: string, shopId: string, input: OrderListInput) {
    await this.access.assertManage(this.db.manager, userId, shopId);
    return this.list(this.db.manager, { shopId }, input);
  }

  async shopDetail(userId: string, shopId: string, id: string) {
    await this.access.assertManage(this.db.manager, userId, shopId);
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
      await this.lock(manager);
      await this.access.assertManage(manager, userId, shopId, true);
      const order = await manager.findOneByOrFail(Order, { id, shopId });
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
        order.handoverBy = new Date(now.getTime() + 48 * 3600000);
      await manager.save(order);
      await manager.save(
        OrderEvent,
        manager.create(OrderEvent, {
          orderId: id,
          action: ORDER_EVENT_ACTION.ACCEPTED,
          actorId: userId,
          reason: null,
          createdAt: now,
        }),
      );
      return { order, expired: false };
    });
    // Throw outside the transaction so deadline cancellation/refund stays committed.
    if (result.expired)
      throw new ConflictException(
        'Seller confirmation deadline has passed; order cancelled and refunded',
      );
    return this.detail(this.db.manager, result.order);
  }

  async reject(userId: string, shopId: string, id: string, reason: string) {
    const order = await this.db.transaction(async (manager) => {
      await this.lock(manager);
      await this.access.assertManage(manager, userId, shopId, true);
      const order = await manager.findOneByOrFail(Order, { id, shopId });
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
          await this.lock(manager);
          const order = await manager.findOneByOrFail(Order, { id: item.id });
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
        // One broken refund must not starve unrelated orders. Persist backoff so
        // even a full batch of failures leaves room on the next worker pass.
        await this.db
          .getRepository(Order)
          .update(
            { id: item.id, status: ORDER_STATUS.PENDING },
            { expiryRetryAt: new Date(Date.now() + 60000) },
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
      await this.lock(manager);
      const order = await manager.findOneByOrFail(Order, {
        id,
        buyerId,
        paymentMethod: ORDER_PAYMENT_METHOD.COD,
      });
      if (order.status === ORDER_STATUS.CANCELLED) return order;
      if (order.status !== ORDER_STATUS.PENDING)
        throw new ConflictException(
          'Seller already confirmed; request cancellation instead',
        );
      const now = await this.now(manager);
      const expired = order.sellerConfirmBy <= now;
      await this.cancel(
        manager,
        order,
        now,
        expired
          ? ORDER_CANCELLATION_REASON.SELLER_CONFIRM_TIMEOUT
          : ORDER_EVENT_ACTION.BUYER_CANCELLED,
        expired ? null : buyerId,
        expired ? null : 'Buyer changed their mind',
      );
      if (!expired)
        await this.codPolicy.recordBuyerCancellation(manager, order, now);
      return order;
    });
    return this.detail(this.db.manager, order);
  }

  // Shipment workflow calls this only after proving no booking exists or GHN
  // confirms cancellation before any observed pickup, within the same lock/tx.
  async cancelCodVerified(manager: EntityManager, order: Order, now: Date) {
    if (
      order.paymentMethod !== ORDER_PAYMENT_METHOD.COD ||
      order.status !== ORDER_STATUS.PREPARING ||
      order.cancelState !== ORDER_CANCEL_STATE.APPROVED
    )
      throw new ConflictException(
        'COD cancellation requires approval and safe carrier state',
      );
    await this.cancel(
      manager,
      order,
      now,
      ORDER_CANCELLATION_REASON.BUYER_CANCEL_APPROVED,
      null,
      order.cancelDecisionReason,
    );
    order.cancelState = ORDER_CANCEL_STATE.CLOSED;
    await manager.save(order);
  }

  private async lock(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
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
      await this.wallet.creditCancellation(manager, order);
    order.stockReleaseReviewIds = await this.releaseStock(manager, order);
    order.status = ORDER_STATUS.CANCELLED;
    order.cancelledAt = now;
    order.cancellationReason = reason;
    order.cancellationNote = note;
    await manager.save(order);
    await manager.save(
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
  }

  private async releaseStock(manager: EntityManager, order: Order) {
    const ids = [...new Set(order.items.map((item) => item.productId))].sort();
    if (!ids.length) return [];
    const products = await manager.find(Product, {
      where: { id: In(ids) },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    const categories = new Map<string, Category>();
    for (const id of [
      ...new Set(
        products.flatMap((product) =>
          product.categoryId ? [product.categoryId] : [],
        ),
      ),
    ].sort()) {
      const category = await manager.findOne(Category, {
        where: { id },
        lock: { mode: 'pessimistic_read' },
      });
      if (category) categories.set(id, category);
    }
    const shop = await manager.findOne(Shop, {
      where: { id: order.shopId },
      lock: { mode: 'pessimistic_read' },
    });
    const review: string[] = [];
    for (const id of ids) {
      const product = products.find((item) => item.id === id);
      const codOwned =
        order.paymentMethod === ORDER_PAYMENT_METHOD.COD &&
        product?.reservedOrderId === order.id &&
        product.status === ProductStatus.HELD;
      if (
        !product ||
        (!codOwned && product.soldOrderId !== order.id) ||
        product.reservationId ||
        product.shopId !== order.shopId ||
        (!codOwned && product.status === ProductStatus.HELD)
      ) {
        review.push(id);
        continue;
      }
      if (product.status === ProductStatus.SOLD || codOwned) {
        const item = order.items.find((item) => item.productId === id)!;
        const eligible =
          shop?.status === ShopStatus.ACTIVE &&
          product.categoryId &&
          categories.get(product.categoryId)?.isActive &&
          product.approvedRevision === product.revision &&
          product.revision === item.revision;
        product.status = eligible ? ProductStatus.ACTIVE : ProductStatus.HIDDEN;
        product.soldAt = null;
        product.heldUntil = null;
      }
      product.soldOrderId = null;
      if (codOwned) product.reservedOrderId = null;
      await manager.save(product);
    }
    return review;
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
