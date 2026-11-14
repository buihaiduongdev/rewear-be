import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager, In, Not } from 'typeorm';

import {
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/order.constants';
import { Order } from '@/modules/order/order.entity';

import { CodBuyerCancellation, CodRestriction } from './cod.entity';

@Injectable()
export class CodPolicy {
  constructor(private readonly db: DataSource) {}

  async assertCanPlace(
    manager: EntityManager,
    buyerId: string,
    itemCount: number,
    now: Date,
  ) {
    const restrictions = await manager.find(CodRestriction, {
      where: { buyerId },
      order: { createdAt: 'DESC' },
    });
    if (
      restrictions.some(
        (row) =>
          !row.resolvedAt && (!row.blockedUntil || row.blockedUntil > now),
      )
    )
      throw new ConflictException(
        'COD is temporarily restricted; prepaid orders remain available',
      );
    const orders = await manager.find(Order, {
      where: {
        buyerId,
        paymentMethod: ORDER_PAYMENT_METHOD.COD,
        status: Not(
          In([
            ORDER_STATUS.DELIVERED,
            ORDER_STATUS.COMPLETED,
            ORDER_STATUS.CANCELLED,
          ]),
        ),
      },
    });
    const active = orders.filter((order) => !order.carrierReturnedAt);
    const pending = active.filter(
      (order) => order.status === ORDER_STATUS.PENDING,
    );
    const pendingCheckouts = new Set(pending.map((order) => order.checkoutId))
      .size;
    const activeCheckouts = new Set(active.map((order) => order.checkoutId))
      .size;
    const pendingItems = pending.reduce(
      (sum, order) => sum + order.items.length,
      0,
    );
    if (
      pendingCheckouts >= 3 ||
      activeCheckouts >= 5 ||
      pendingItems + itemCount > 20
    )
      throw new ConflictException({
        message: 'COD limit reached',
        remainingPendingCheckouts: Math.max(0, 3 - pendingCheckouts),
        remainingPendingItems: Math.max(0, 20 - pendingItems),
        remainingActiveCheckouts: Math.max(0, 5 - activeCheckouts),
      });
  }

  async recordBuyerCancellation(
    manager: EntityManager,
    order: Order,
    now: Date,
  ) {
    if (!order.checkoutId) return;
    if (
      await manager.existsBy(CodBuyerCancellation, {
        buyerId: order.buyerId,
        checkoutId: order.checkoutId,
      })
    )
      return;
    await manager.save(
      CodBuyerCancellation,
      manager.create(CodBuyerCancellation, {
        buyerId: order.buyerId,
        checkoutId: order.checkoutId,
        createdAt: now,
      }),
    );
    const restrictions = await manager.find(CodRestriction, {
      where: { buyerId: order.buyerId },
      order: { createdAt: 'DESC' },
    });
    if (
      restrictions.some(
        (row) =>
          !row.resolvedAt && (!row.blockedUntil || row.blockedUntil > now),
      )
    )
      return;
    const previous = restrictions[0];
    const openedAt = previous?.resolvedAt ?? previous?.blockedUntil;
    const since = new Date(
      Math.max(now.getTime() - 86400000, openedAt?.getTime() ?? 0),
    );
    const count = await manager
      .getRepository(CodBuyerCancellation)
      .createQueryBuilder('event')
      .where('event.buyerId = :buyerId', { buyerId: order.buyerId })
      .andWhere('event.createdAt > :since', { since })
      .getCount();
    if (count < 5) return;
    const episodes = restrictions.filter(
      (row) => row.createdAt.getTime() >= now.getTime() - 30 * 86400000,
    ).length;
    await manager.save(
      CodRestriction,
      manager.create(CodRestriction, {
        buyerId: order.buyerId,
        cause: 'REPEATED_CANCELLATION',
        blockedUntil:
          episodes >= 2
            ? null
            : new Date(now.getTime() + (episodes === 0 ? 24 : 72) * 3600000),
        resolvedAt: null,
        resolutionReason: null,
        resolvedBy: null,
        createdAt: now,
      }),
    );
  }

  mine(buyerId: string) {
    return this.db
      .getRepository(CodRestriction)
      .find({ where: { buyerId }, order: { createdAt: 'DESC' }, take: 100 });
  }

  async resolve(adminId: string, id: string, reason: string) {
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const row = await manager.findOneByOrFail(CodRestriction, { id });
      if (row.resolvedAt) return row;
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      row.resolvedAt = new Date(now);
      row.resolutionReason = reason;
      row.resolvedBy = adminId;
      return manager.save(row);
    });
  }
}
