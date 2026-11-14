import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, In } from 'typeorm';

import { Cart, CartItem } from '@/modules/cart/entities';
import { Category } from '@/modules/category/entities';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { Order, OrderEvent } from '@/modules/order/order.entity';
import { PaymentAttempt } from '@/modules/payment/payment.entity';
import { PaymentPricing } from '@/modules/payment/payment.pricing';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';

import { CodPolicy } from './cod.policy';
import { codOrderTotalSchema, placeCodSchema } from './schemas/cod.schema';

@Injectable()
export class CodService {
  constructor(
    private readonly db: DataSource,
    private readonly pricing: PaymentPricing,
    private readonly policy: CodPolicy,
  ) {}

  async place(buyerId: string, checkoutId: string, expectedTotal: number) {
    const existing = await this.db.getRepository(Order).find({
      where: { buyerId, checkoutId, paymentMethod: 'COD' },
      order: { id: 'ASC' },
    });
    if (existing.length) {
      this.assertExpectedTotal(existing, expectedTotal);
      return existing;
    }
    let quote: Awaited<ReturnType<PaymentPricing['quote']>>;
    try {
      quote = await this.pricing.quote(buyerId, checkoutId);
    } catch (error) {
      // Another identical request can commit COD_PLACED while GHN quoting is
      // still running. Return its durable result instead of rejecting replay.
      const replay = await this.db.getRepository(Order).find({
        where: { buyerId, checkoutId, paymentMethod: 'COD' },
        order: { id: 'ASC' },
      });
      if (replay.length) {
        this.assertExpectedTotal(replay, expectedTotal);
        return replay;
      }
      throw error;
    }
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const checkout = await manager.findOneByOrFail(Checkout, {
        id: checkoutId,
        buyerId,
      });
      const replay = await manager.find(Order, {
        where: { buyerId, checkoutId, paymentMethod: 'COD' },
        order: { id: 'ASC' },
      });
      if (replay.length) {
        this.assertExpectedTotal(replay, expectedTotal);
        return replay;
      }
      if (checkout.status !== 'HELD')
        throw new ConflictException('An active checkout is required');
      const attempts = await manager.find(PaymentAttempt, {
        where: { checkoutId },
      });
      if (
        attempts.some(
          (attempt) => !['FAILED', 'REFUNDED'].includes(attempt.state),
        )
      )
        throw new ConflictException(
          'Resolve the previous payment before choosing COD',
        );
      const snapshots = await this.pricing.snapshot(manager, checkout, quote);
      this.assertExpectedTotal(
        snapshots.map((order) => ({
          total: order.subtotal + order.shippingFee,
        })),
        expectedTotal,
      );
      const ids = snapshots
        .flatMap((order) => order.items.map((item) => item.productId))
        .sort();
      const products = await manager.find(Product, {
        where: { id: In(ids) },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      for (const categoryId of [
        ...new Set(
          products.flatMap((product) =>
            product.categoryId ? [product.categoryId] : [],
          ),
        ),
      ].sort()) {
        await manager.findOneOrFail(Category, {
          where: { id: categoryId, isActive: true },
          lock: { mode: 'pessimistic_read' },
        });
      }
      for (const shopId of [
        ...new Set(snapshots.map((order) => order.shopId)),
      ].sort())
        await manager.findOneOrFail(Shop, {
          where: { id: shopId, status: ShopStatus.ACTIVE },
          lock: { mode: 'pessimistic_read' },
        });
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      if (
        !checkout.expiresAt ||
        checkout.expiresAt <= now ||
        ids.length !== new Set(ids).size ||
        products.length !== ids.length ||
        products.some(
          (product) =>
            product.status !== ProductStatus.HELD ||
            product.reservationId !== checkout.id ||
            !product.categoryId ||
            product.approvedRevision !== product.revision,
        )
      )
        throw new ConflictException('Checkout stock is no longer reserved');
      await this.policy.assertCanPlace(manager, buyerId, ids.length, now);
      const orders: Order[] = [];
      for (const snapshot of snapshots) {
        const total = snapshot.subtotal + snapshot.shippingFee;
        if (!codOrderTotalSchema.safeParse(total).success)
          throw new ConflictException('Order total is outside COD limits');
        const order = await manager.save(
          Order,
          manager.create(Order, {
            ...snapshot,
            checkoutId,
            buyerId,
            paymentId: null,
            paymentMethod: 'COD',
            status: 'pending',
            total,
            sellerConfirmBy: new Date(now.getTime() + 86400000),
            commissionBasisPoints: 300,
          }),
        );
        await manager.save(
          OrderEvent,
          manager.create(OrderEvent, {
            orderId: order.id,
            action: 'PLACED',
            actorId: buyerId,
            reason: null,
            createdAt: now,
          }),
        );
        await manager.update(
          Product,
          {
            id: In(order.items.map((item) => item.productId)),
            reservationId: checkoutId,
            status: ProductStatus.HELD,
          },
          { reservedOrderId: order.id, heldUntil: null, reservationId: null },
        );
        orders.push(order);
      }
      checkout.status = 'COD_PLACED';
      await manager.save(checkout);
      const cart = await manager.findOneBy(Cart, { userId: buyerId });
      if (cart)
        await manager.delete(CartItem, { cartId: cart.id, productId: In(ids) });
      return orders;
    });
  }

  private assertExpectedTotal(
    orders: { total: number }[],
    expectedTotal: number,
  ) {
    if (
      !placeCodSchema.shape.expectedTotal.safeParse(expectedTotal).success ||
      orders.reduce((sum, order) => sum + order.total, 0) !== expectedTotal
    )
      throw new ConflictException(
        'COD total changed; review the current shipping quote before placing',
      );
  }
}
