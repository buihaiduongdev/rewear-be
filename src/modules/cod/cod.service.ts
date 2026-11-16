import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { Cart, CartItem } from '@/modules/cart/entities';
import { Category } from '@/modules/category/entities';
import { CHECKOUT_STATUS } from '@/modules/checkout/constants/checkout.constant';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { ORDER_POLICY } from '@/modules/order/constants/order.constant';
import {
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import { Order, OrderEvent } from '@/modules/order/entities/order.entity';
import { PAYMENT_ATTEMPT_STATE } from '@/modules/payment/constants/payment.constant';
import { PaymentAttempt } from '@/modules/payment/entities/payment.entity';
import { PaymentPricing } from '@/modules/payment/payment.pricing';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';

import { CodPolicy } from './policies/cod.policy';
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
      where: { buyerId, checkoutId, paymentMethod: ORDER_PAYMENT_METHOD.COD },
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
        where: { buyerId, checkoutId, paymentMethod: ORDER_PAYMENT_METHOD.COD },
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
        where: { buyerId, checkoutId, paymentMethod: ORDER_PAYMENT_METHOD.COD },
        order: { id: 'ASC' },
      });
      if (replay.length) {
        this.assertExpectedTotal(replay, expectedTotal);
        return replay;
      }
      if (checkout.status !== CHECKOUT_STATUS.HELD)
        throw new ConflictException('An active checkout is required');
      const attempts = await manager.find(PaymentAttempt, {
        where: { checkoutId },
      });
      const hasUnresolvedPayment = attempts.some(
        (attempt) =>
          !(
            [
              PAYMENT_ATTEMPT_STATE.FAILED,
              PAYMENT_ATTEMPT_STATE.REFUNDED,
            ] as readonly string[]
          ).includes(attempt.state),
      );
      if (hasUnresolvedPayment)
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
      const { ids, now } = await this.validateReservedStock(
        manager,
        checkout,
        snapshots,
      );
      await this.policy.assertCanPlace(manager, buyerId, ids.length, now);
      const orders = await this.createOrders(
        manager,
        buyerId,
        checkoutId,
        snapshots,
        now,
      );
      checkout.status = CHECKOUT_STATUS.COD_PLACED;
      await manager.save(checkout);
      const cart = await manager.findOneBy(Cart, { userId: buyerId });
      if (cart)
        await manager.delete(CartItem, { cartId: cart.id, productId: In(ids) });
      return orders;
    });
  }

  private async validateReservedStock(
    manager: EntityManager,
    checkout: Checkout,
    snapshots: Awaited<ReturnType<PaymentPricing['snapshot']>>,
  ) {
    const ids = snapshots
      .flatMap((order) => order.items.map((item) => item.productId))
      .sort();
    const products = await manager.find(Product, {
      where: { id: In(ids) },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    const approvedIds = await this.lockStockEligibility(
      manager,
      ids,
      products,
      snapshots,
    );
    const [{ now: clock }] = await manager.query(
      'SELECT clock_timestamp() AS now',
    );
    const now = new Date(clock);
    const stockIsNoLongerReserved =
      !checkout.expiresAt ||
      checkout.expiresAt <= now ||
      ids.length !== new Set(ids).size ||
      products.length !== ids.length ||
      products.some(
        (product) =>
          product.status !== ProductStatus.HELD ||
          product.reservationId !== checkout.id ||
          !product.categoryId ||
          !approvedIds.has(product.id),
      );
    if (stockIsNoLongerReserved)
      throw new ConflictException('Checkout stock is no longer reserved');
    return { ids, now };
  }

  private async lockStockEligibility(
    manager: EntityManager,
    ids: string[],
    products: Product[],
    snapshots: Awaited<ReturnType<PaymentPricing['snapshot']>>,
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
    return approvedIds;
  }

  private async createOrders(
    manager: EntityManager,
    buyerId: string,
    checkoutId: string,
    snapshots: Awaited<ReturnType<PaymentPricing['snapshot']>>,
    now: Date,
  ) {
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
          paymentMethod: ORDER_PAYMENT_METHOD.COD,
          status: ORDER_STATUS.PENDING,
          total,
          sellerConfirmBy: new Date(
            now.getTime() + ORDER_POLICY.SELLER_CONFIRM_WINDOW_MS,
          ),
          commissionBasisPoints: ORDER_POLICY.DEFAULT_COMMISSION_BASIS_POINTS,
        }),
      );
      await manager.save(
        OrderEvent,
        manager.create(OrderEvent, {
          orderId: order.id,
          action: ORDER_EVENT_ACTION.PLACED,
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
    return orders;
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
