import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { Cart, CartItem } from '@/modules/cart/entities';
import { Category } from '@/modules/category/entities';
import { CHECKOUT_STATUS } from '@/modules/checkout/constants/checkout.constant';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { CoinService } from '@/modules/coins/core/coin.service';
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxService } from '@/modules/event/outbox.service';
import {
  ORDER_CANCELLATION_REASON,
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
  ORDER_POLICY,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import { Order, OrderEvent } from '@/modules/order/entities';
import { OrderService } from '@/modules/order/order.service';
import { PAYMENT_ATTEMPT_STATE } from '@/modules/payment/constants/payment.constant';
import { PaymentAttempt } from '@/modules/payment/entities';
import { PaymentPricing } from '@/modules/payment/payment.pricing';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShopFinanceService } from '@/modules/shop-finance/shop-finance.service';
import { shopAllowsIdentitySales } from '@/modules/shop/applications/constants/shop-application.constant';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { WalletCheckoutHold } from '@/modules/wallet/checkout/entities';
import { WALLET_HOLD_STATE } from '@/modules/wallet/constants/wallet.constant';

import { COD_FAULT_PARTY } from './constants/cod.constant';
import { CodPolicy } from './policies/cod.policy';
import {
  codOrderTotalSchema,
  type PlaceCodInput,
  placeCodSchema,
  type ResolveCodReturnInput,
  resolveCodReturnSchema,
} from './schemas/cod.schema';

@Injectable()
export class CodService {
  constructor(
    private readonly db: DataSource,
    private readonly paymentPricing: PaymentPricing,
    private readonly codPolicy: CodPolicy,
    private readonly outboxService: OutboxService,
    private readonly coinService: CoinService,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    @Inject(forwardRef(() => ShopFinanceService))
    private readonly shopFinanceService: ShopFinanceService,
  ) {}

  async place(
    buyerId: string,
    checkoutId: string,
    { expectedTotal }: PlaceCodInput,
  ) {
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
      quote = await this.paymentPricing.quote(buyerId, checkoutId);
    } catch (error) {
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
      await manager.findOne(User, {
        where: { id: buyerId },
        lock: { mode: 'pessimistic_write' },
      });
      const checkout = await manager.findOneOrFail(Checkout, {
        where: { id: checkoutId, buyerId },
        lock: { mode: 'pessimistic_write' },
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
      if (
        await manager.existsBy(WalletCheckoutHold, {
          checkoutId,
          state: WALLET_HOLD_STATE.HELD,
        })
      )
        throw new ConflictException(
          'Release wallet reservation before choosing COD',
        );
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
      const snapshots = await this.paymentPricing.snapshot(
        manager,
        checkout,
        quote,
      );
      this.assertExpectedTotal(
        snapshots.map((order) => ({
          total: order.subtotal + order.shippingFee - (order.coinDiscount ?? 0),
        })),
        expectedTotal,
      );
      const { ids, now } = await this.validateReservedStock(
        manager,
        checkout,
        snapshots,
      );
      await this.codPolicy.assertCanPlace(manager, buyerId, ids.length, now);
      const orders = await this.createOrders(
        manager,
        buyerId,
        checkoutId,
        snapshots,
        now,
      );
      await this.coinService.commitCodCoins(manager, checkout.id, orders, now);
      checkout.status = CHECKOUT_STATUS.COD_PLACED;
      await manager.save(checkout);
      const cart = await manager.findOneBy(Cart, { userId: buyerId });
      if (cart)
        await manager.delete(CartItem, { cartId: cart.id, productId: In(ids) });
      return orders;
    });
  }

  async resolveReturnedOrder(
    adminId: string,
    orderId: string,
    input: ResolveCodReturnInput,
  ) {
    const data = resolveCodReturnSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const order = await manager.findOneOrFail(Order, {
        where: { id: orderId, paymentMethod: ORDER_PAYMENT_METHOD.COD },
        lock: { mode: 'pessimistic_write' },
      });
      const shipment = await manager.findOneOrFail(Shipment, {
        where: { orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        order.status === ORDER_STATUS.CANCELLED &&
        order.cancellationReason === ORDER_CANCELLATION_REASON.CARRIER_RETURNED
      ) {
        return order;
      }
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      order.cancellationNote = data.reason;
      await this.orderService.releaseCodReturnedVerified(
        manager,
        order,
        now,
        data.sellable,
        adminId,
      );
      if (data.fault === COD_FAULT_PARTY.SELLER) {
        await this.shopFinanceService.recordCodShippingDebit(
          manager,
          order,
          shipment.carrierFee ?? order.shippingFee,
          data.mode,
          adminId,
        );
      } else {
        await this.codPolicy.recordFailedDelivery(manager, order, now);
      }
      return order;
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
    const categoryIds = [
      ...new Set(
        products.flatMap((product) =>
          product.categoryId ? [product.categoryId] : [],
        ),
      ),
    ].sort();
    if (categoryIds.length > 0) {
      const activeCategories = await manager.find(Category, {
        where: { id: In(categoryIds), isActive: true },
        lock: { mode: 'pessimistic_read' },
      });
      if (activeCategories.length !== categoryIds.length) {
        throw new ConflictException('Category is inactive or missing');
      }
    }
    const shopIds = [...new Set(snapshots.map((order) => order.shopId))].sort();
    if (shopIds.length > 0) {
      const activeShops = await manager.find(Shop, {
        where: { id: In(shopIds), status: ShopStatus.ACTIVE },
        lock: { mode: 'pessimistic_read' },
      });
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      if (
        activeShops.length !== shopIds.length ||
        activeShops.some(
          (shop) => !shopAllowsIdentitySales(shop, new Date(now)),
        )
      ) {
        throw new ConflictException('Shop is inactive or missing');
      }
    }
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
      const total =
        snapshot.subtotal + snapshot.shippingFee - (snapshot.coinDiscount ?? 0);
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
      await this.outboxService.record(manager, {
        eventType: EVENT_TYPES.ORDER_CREATED,
        resourceId: order.id,
        payload: {
          orderId: order.id,
          buyerId: order.buyerId,
          shopId: order.shopId,
        },
      });
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
