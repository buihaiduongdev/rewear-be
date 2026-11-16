import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import ms from 'ms';
import { DataSource, EntityManager, In } from 'typeorm';

import { MAX_VND_AMOUNT } from '@/common/constants/money.constant';
import { MomoSandboxClient } from '@/infrastructure/payment/momo-sandbox.client';
import type {
  MomoNotification,
  MomoResult,
} from '@/infrastructure/payment/momo-sandbox.client';
import { Cart, CartItem } from '@/modules/cart/entities';
import { CHECKOUT_STATUS } from '@/modules/checkout/constants/checkout.constant';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { ORDER_POLICY } from '@/modules/order/constants/order.constant';
import {
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import { Order, OrderEvent } from '@/modules/order/entities/order.entity';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';

import {
  PAYMENT_MAX_AMOUNT,
  PAYMENT_MIN_AMOUNT,
} from './constants/payment.constant';
import {
  PAYMENT_ATTEMPT_STATE,
  PAYMENT_CAPTURE_DISPOSITION,
  PAYMENT_PROVIDER_SUCCESS_CODE,
  PAYMENT_QUERY_LEASE_MS,
  PAYMENT_REFUND_REASON,
  PAYMENT_REFUND_STATE,
} from './constants/payment.constant';
import { PaymentAttempt, PaymentRefund } from './entities/payment.entity';
import { MOMO_CLIENT } from './payment.config';
import { PaymentPricing } from './payment.pricing';
import {
  canStartAttempt,
  captureDisposition,
  firstReconciliationAt,
  providerOutcome,
} from './policies/payment.policy';

@Injectable()
export class PaymentService {
  constructor(
    private readonly db: DataSource,
    @Inject(MOMO_CLIENT) private readonly client: MomoSandboxClient | null,
    private readonly pricing: PaymentPricing,
  ) {}

  private gateway() {
    if (!this.client)
      throw new ServiceUnavailableException('MoMo Sandbox is disabled');
    return this.client;
  }

  private async lock(manager: EntityManager): Promise<Date> {
    // Same order as checkout create/cancel/expiry across every process.
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }

  async create(buyerId: string, checkoutId: string, requestId: string) {
    const gateway = this.gateway();
    const existing = await this.db.getRepository(PaymentAttempt).findOneBy({
      checkoutId,
      buyerId,
      requestId,
    });
    if (existing) return this.findMine(buyerId, existing.id);
    const quote = await this.pricing.quote(buyerId, checkoutId);
    const prepared = await this.db.transaction(async (manager) => {
      return this.prepareAttempt(
        manager,
        buyerId,
        checkoutId,
        requestId,
        quote,
      );
    });
    if (!prepared.send) return this.findMine(buyerId, prepared.attempt.id);
    const attempt = prepared.attempt;
    // Persist before HTTP: a timeout/crash must not allow another charge.
    try {
      const result = await gateway.create({
        orderId: attempt.id,
        requestId: attempt.id,
        amount: attempt.amount,
        orderInfo: `Rewear ${checkoutId}`,
      });
      await this.db.transaction(async (manager) => {
        await this.lock(manager);
        const current = await manager.findOneByOrFail(PaymentAttempt, {
          id: attempt.id,
        });
        // A concurrent query may have changed CREATING to UNKNOWN. Preserve a
        // valid payment URL for unresolved attempts, but never overwrite capture.
        const attemptIsResolved = !(
          [
            PAYMENT_ATTEMPT_STATE.CREATING,
            PAYMENT_ATTEMPT_STATE.PENDING,
            PAYMENT_ATTEMPT_STATE.UNKNOWN,
          ] as readonly string[]
        ).includes(current.state);
        if (attemptIsResolved) return;
        current.state =
          result.resultCode === PAYMENT_PROVIDER_SUCCESS_CODE
            ? PAYMENT_ATTEMPT_STATE.PENDING
            : providerOutcome(result.resultCode) ===
                PAYMENT_ATTEMPT_STATE.FAILED
              ? PAYMENT_ATTEMPT_STATE.FAILED
              : PAYMENT_ATTEMPT_STATE.UNKNOWN;
        current.resultCode = result.resultCode;
        current.payUrl = result.payUrl ?? null;
        await manager.save(current);
      });
    } catch {
      await this.db
        .getRepository(PaymentAttempt)
        .update(
          { id: attempt.id, state: PAYMENT_ATTEMPT_STATE.CREATING },
          { state: PAYMENT_ATTEMPT_STATE.UNKNOWN },
        );
    }
    return this.findMine(buyerId, attempt.id);
  }

  private async prepareAttempt(
    manager: EntityManager,
    buyerId: string,
    checkoutId: string,
    requestId: string,
    quote: Awaited<ReturnType<PaymentPricing['quote']>>,
  ) {
    const now = await this.lock(manager);
    const checkout = await manager.findOneByOrFail(Checkout, {
      id: checkoutId,
      buyerId,
    });
    const attempts = await manager.find(PaymentAttempt, {
      where: { checkoutId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const previous = attempts.find((item) => item.requestId === requestId);
    if (previous) return { attempt: previous, send: false };
    const expiresAt = checkout.expiresAt;
    const checkoutIsInactive =
      checkout.status !== CHECKOUT_STATUS.HELD ||
      !expiresAt ||
      expiresAt <= now;
    if (checkoutIsInactive)
      throw new ConflictException('An active checkout is required');
    if (!canStartAttempt(attempts.map((item) => item.state)))
      throw new ConflictException(
        'Resolve the previous payment or the three-attempt limit before trying again',
      );
    const orders = await this.pricing.snapshot(manager, checkout, quote);
    const amount = orders.reduce(
      (sum, order) => sum + order.subtotal + order.shippingFee,
      0,
    );
    const amountIsOutsideMomoLimits =
      !Number.isSafeInteger(amount) ||
      amount < PAYMENT_MIN_AMOUNT ||
      amount > PAYMENT_MAX_AMOUNT;
    if (amountIsOutsideMomoLimits)
      throw new ConflictException('Checkout total is outside MoMo limits');
    const products = await this.lockProducts(manager, checkout);
    const stockIsNoLongerReserved = !this.ownsProducts(
      checkout,
      orders.flatMap((order) => order.items.map((item) => item.productId)),
      products,
    );
    if (stockIsNoLongerReserved)
      throw new ConflictException('Checkout stock is no longer reserved');
    for (const shopId of [
      ...new Set(orders.map((order) => order.shopId)),
    ].sort()) {
      await manager.findOneOrFail(Shop, {
        where: { id: shopId, status: ShopStatus.ACTIVE },
        lock: { mode: 'pessimistic_read' },
      });
    }
    const attempt = await this.savePreparedAttempt(
      manager,
      buyerId,
      checkoutId,
      requestId,
      amount,
      orders,
      now,
      expiresAt,
    );
    return { attempt, send: true };
  }

  private savePreparedAttempt(
    manager: EntityManager,
    buyerId: string,
    checkoutId: string,
    requestId: string,
    amount: number,
    orders: PaymentAttempt['orders'],
    now: Date,
    expiresAt: Date,
  ) {
    return manager.save(
      PaymentAttempt,
      manager.create(PaymentAttempt, {
        id: randomUUID(),
        checkoutId,
        buyerId,
        requestId,
        amount,
        orders,
        state: PAYMENT_ATTEMPT_STATE.CREATING,
        payUrl: null,
        providerTransId: null,
        resultCode: null,
        capturedAmount: null,
        paidAt: null,
        nextQueryAt: new Date(
          firstReconciliationAt(now.getTime(), expiresAt.getTime()),
        ),
      }),
    );
  }

  async findMine(buyerId: string, id: string) {
    const attempt = await this.db
      .getRepository(PaymentAttempt)
      .findOneByOrFail({ id, buyerId });
    const refunds = await this.db
      .getRepository(PaymentRefund)
      .find({ where: { paymentId: id }, order: { createdAt: 'ASC' } });
    return {
      id,
      checkoutId: attempt.checkoutId,
      amount: attempt.amount,
      state: attempt.state,
      payUrl:
        attempt.state === PAYMENT_ATTEMPT_STATE.PENDING ? attempt.payUrl : null,
      paidAt: attempt.paidAt,
      refunds: refunds.map((refund) => ({
        id: refund.id,
        amount: refund.amount,
        state: refund.state,
      })),
    };
  }

  async ipn(body: MomoNotification) {
    let result: MomoNotification;
    try {
      result = this.gateway().verifyIpn(body);
    } catch {
      throw new UnauthorizedException('Invalid MoMo notification');
    }
    // Provider requestId is our attempt ID, distinct from client idempotency key.
    const notificationReferenceIsInvalid =
      result.requestId !== result.orderId ||
      result.orderInfo !==
        `Rewear ${(await this.db.getRepository(PaymentAttempt).findOneByOrFail({ id: result.orderId })).checkoutId}` ||
      result.orderType !== 'momo_wallet';
    if (notificationReferenceIsInvalid)
      throw new UnauthorizedException('MoMo reference mismatch');
    await this.applyResult(result.orderId, result);
  }

  async reconcile(buyerId: string, id: string) {
    await this.db
      .getRepository(PaymentAttempt)
      .findOneByOrFail({ id, buyerId });
    await this.queryAttempt(id);
    return this.findMine(buyerId, id);
  }

  async queryAttempt(id: string) {
    const gateway = this.gateway();
    const claimed = await this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const attempt = await manager.findOneByOrFail(PaymentAttempt, { id });
      const attemptCannotBeQueried =
        !(
          [
            PAYMENT_ATTEMPT_STATE.CREATING,
            PAYMENT_ATTEMPT_STATE.PENDING,
            PAYMENT_ATTEMPT_STATE.UNKNOWN,
          ] as readonly string[]
        ).includes(attempt.state) || attempt.nextQueryAt > now;
      if (attemptCannotBeQueried) return false;
      // Lease is longer than maximum configured HTTP timeout (60 seconds).
      attempt.nextQueryAt = new Date(now.getTime() + PAYMENT_QUERY_LEASE_MS);
      await manager.save(attempt);
      return true;
    });
    if (!claimed) return;
    try {
      const result = await gateway.query(id, randomUUID());
      await this.applyResult(id, result);
    } catch {
      // Keep the durable unknown state and lease, never infer failure from HTTP.
    }
  }

  async applyResult(id: string, result: MomoResult) {
    if (result.orderId !== id)
      throw new UnauthorizedException('MoMo reference mismatch');
    await this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const attempt = await manager.findOneByOrFail(PaymentAttempt, { id });
      const attemptIsSettled = (
        [
          PAYMENT_ATTEMPT_STATE.PAID,
          PAYMENT_ATTEMPT_STATE.REFUND_REQUIRED,
          PAYMENT_ATTEMPT_STATE.REFUNDED,
        ] as readonly string[]
      ).includes(attempt.state);
      if (attemptIsSettled) {
        if (
          result.resultCode === PAYMENT_PROVIDER_SUCCESS_CODE &&
          attempt.providerTransId !== String(result.transId)
        ) {
          const outstanding = await this.queueRefund(manager, id, result, now);
          if (attempt.state === PAYMENT_ATTEMPT_STATE.REFUNDED && outstanding) {
            attempt.state = PAYMENT_ATTEMPT_STATE.REFUND_REQUIRED;
            await manager.save(attempt);
          }
        }
        return;
      }
      const checkout = await manager.findOneByOrFail(Checkout, {
        id: attempt.checkoutId,
      });
      const products = await this.lockProducts(manager, checkout);
      const expectedIds = attempt.orders.flatMap((order) =>
        order.items.map((item) => item.productId),
      );
      const outcome = await this.captureOutcome(
        manager,
        attempt,
        checkout,
        products,
        result,
        now,
      );
      attempt.resultCode = result.resultCode;
      if (outcome === PAYMENT_CAPTURE_DISPOSITION.FAILED)
        attempt.state = PAYMENT_ATTEMPT_STATE.FAILED;
      else if (outcome === PAYMENT_CAPTURE_DISPOSITION.UNKNOWN) {
        if (attempt.state !== PAYMENT_ATTEMPT_STATE.FAILED)
          attempt.state = PAYMENT_ATTEMPT_STATE.UNKNOWN;
      } else {
        const capturedFundsAreInvalid =
          !Number.isSafeInteger(result.transId) ||
          result.transId <= 0 ||
          !Number.isSafeInteger(result.amount) ||
          result.amount <= 0 ||
          result.amount > MAX_VND_AMOUNT;
        if (capturedFundsAreInvalid)
          throw new ConflictException(
            'Invalid captured funds require reconciliation',
          );
        attempt.providerTransId = String(result.transId);
        attempt.capturedAmount = result.amount;
        attempt.paidAt = now;
        if (outcome === PAYMENT_CAPTURE_DISPOSITION.REFUND) {
          attempt.state = PAYMENT_ATTEMPT_STATE.REFUND_REQUIRED;
          await this.queueRefund(manager, id, result, now);
        } else {
          attempt.state = PAYMENT_ATTEMPT_STATE.PAID;
          // Save payment first for order FK. All writes roll back together.
          await manager.save(attempt);
          await this.fulfilCapturedCheckout(
            manager,
            attempt,
            checkout,
            expectedIds,
            now,
          );
        }
      }
      const remaining = (checkout.expiresAt?.getTime() ?? 0) - now.getTime();
      attempt.nextQueryAt = new Date(
        now.getTime() +
          (remaining > 0 && remaining <= ms('2m') ? ms('15s') : ms('1m')),
      );
      await manager.save(attempt);
    });
  }

  private async captureOutcome(
    manager: EntityManager,
    attempt: PaymentAttempt,
    checkout: Checkout,
    products: Product[],
    result: MomoResult,
    now: Date,
  ) {
    let shopsActive = true;
    for (const shopId of [
      ...new Set(attempt.orders.map((order) => order.shopId)),
    ].sort()) {
      const shop = await manager.findOne(Shop, {
        where: { id: shopId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!shop || shop.status !== ShopStatus.ACTIVE) shopsActive = false;
    }
    const expectedIds = attempt.orders.flatMap((order) =>
      order.items.map((item) => item.productId),
    );
    return captureDisposition({
      amount: result.amount,
      expectedAmount: attempt.amount,
      resultCode: result.resultCode,
      checkoutState: checkout.status,
      expiresAt: checkout.expiresAt?.getTime() ?? 0,
      now: now.getTime(),
      alreadyPaid: await manager.existsBy(Order, {
        checkoutOrderId: In(
          attempt.orders.map((order) => order.checkoutOrderId),
        ),
      }),
      ownsAllProducts:
        shopsActive && this.ownsProducts(checkout, expectedIds, products),
    });
  }

  private async fulfilCapturedCheckout(
    manager: EntityManager,
    attempt: PaymentAttempt,
    checkout: Checkout,
    expectedIds: string[],
    now: Date,
  ) {
    for (const snapshot of attempt.orders) {
      await this.createCapturedOrder(manager, attempt, checkout, snapshot, now);
    }
    checkout.status = CHECKOUT_STATUS.PAID;
    await manager.save(checkout);
    const cart = await manager.findOneBy(Cart, {
      userId: attempt.buyerId,
    });
    if (cart)
      await manager.delete(CartItem, {
        cartId: cart.id,
        productId: In(expectedIds),
      });
  }

  private async createCapturedOrder(
    manager: EntityManager,
    attempt: PaymentAttempt,
    checkout: Checkout,
    snapshot: PaymentAttempt['orders'][number],
    now: Date,
  ) {
    const {
      checkoutOrderId,
      shopId,
      shopName,
      subtotal,
      shippingFee,
      address,
      items,
    } = snapshot;
    const order = await manager.save(
      manager.create(Order, {
        checkoutOrderId,
        checkoutId: checkout.id,
        paymentMethod: ORDER_PAYMENT_METHOD.MOMO,
        paymentId: attempt.id,
        buyerId: attempt.buyerId,
        shopId,
        shopName,
        subtotal,
        shippingFee,
        total: subtotal + shippingFee,
        address,
        items,
        status: ORDER_STATUS.PENDING,
        commissionBasisPoints: ORDER_POLICY.DEFAULT_COMMISSION_BASIS_POINTS,
        sellerConfirmBy: new Date(
          now.getTime() + ORDER_POLICY.SELLER_CONFIRM_WINDOW_MS,
        ),
      }),
    );
    await manager.save(
      OrderEvent,
      manager.create(OrderEvent, {
        orderId: order.id,
        action: ORDER_EVENT_ACTION.PAID,
        actorId: null,
        reason: null,
        createdAt: now,
      }),
    );
    await manager.update(
      Product,
      {
        id: In(items.map((item) => item.productId)),
        reservationId: checkout.id,
        status: ProductStatus.HELD,
      },
      {
        status: ProductStatus.SOLD,
        heldUntil: null,
        reservationId: null,
        soldOrderId: order.id,
        soldAt: now,
      },
    );
  }

  private async queueRefund(
    manager: EntityManager,
    paymentId: string,
    result: MomoResult,
    now: Date,
  ) {
    const capturedFundsAreInvalid =
      !Number.isSafeInteger(result.transId) ||
      result.transId <= 0 ||
      !Number.isSafeInteger(result.amount) ||
      result.amount <= 0 ||
      result.amount > MAX_VND_AMOUNT;
    if (capturedFundsAreInvalid)
      throw new ConflictException(
        'Invalid captured funds require reconciliation',
      );
    const providerTransId = String(result.transId);
    const previous = await manager.findOneBy(PaymentRefund, {
      providerTransId,
    });
    if (previous) {
      if (previous.paymentId !== paymentId || previous.amount !== result.amount)
        throw new ConflictException(
          'Conflicting capture requires reconciliation',
        );
      return previous.state !== PAYMENT_REFUND_STATE.COMPLETED;
    }
    await manager.save(
      PaymentRefund,
      manager.create(PaymentRefund, {
        paymentId,
        providerTransId,
        amount: result.amount,
        reason: PAYMENT_REFUND_REASON.LATE_OR_INVALID_CAPTURE,
        state:
          result.amount < PAYMENT_MIN_AMOUNT ||
          result.amount > PAYMENT_MAX_AMOUNT
            ? PAYMENT_REFUND_STATE.REVIEW_REQUIRED
            : PAYMENT_REFUND_STATE.QUEUED,
        nextQueryAt: now,
        alertedAt: null,
      }),
    );
    return true;
  }

  private lockProducts(manager: EntityManager, checkout: Checkout) {
    return manager.find(Product, {
      where: { id: In(checkout.requestedProductIds) },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private ownsProducts(
    checkout: Checkout,
    expected: string[],
    products: Product[],
  ) {
    return (
      expected.length > 0 &&
      new Set(expected).size === expected.length &&
      expected.every((id) =>
        products.some(
          (product) =>
            product.id === id &&
            product.status === ProductStatus.HELD &&
            product.reservationId === checkout.id,
        ),
      )
    );
  }
}
