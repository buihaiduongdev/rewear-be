import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import ms from 'ms';
import { DataSource, EntityManager, In } from 'typeorm';

import { MAX_VND_AMOUNT } from '@/common/constants/money.constant';
import {
  generatePayosOrderCode,
  isIncludedInAggregateTransId,
  PayosClient,
  type PayosPaymentResult,
  type PayosWebhookResult,
} from '@/infrastructure/payment/payos.client';
import { Cart, CartItem } from '@/modules/cart/entities';
import { CHECKOUT_STATUS } from '@/modules/checkout/constants/checkout.constant';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { CoinService } from '@/modules/coins/coin.service';
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxService } from '@/modules/event/outbox.service';
import {
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
  ORDER_POLICY,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import { Order, OrderEvent } from '@/modules/order/entities';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { shopAllowsIdentitySales } from '@/modules/shop/applications/renewal/identity-sale.policy';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';
import { WALLET_HOLD_STATE } from '@/modules/wallet/constants/wallet.constant';
import { WalletCheckoutHold } from '@/modules/wallet/entities';

import {
  PAYMENT_ATTEMPT_STATE,
  PAYMENT_CAPTURE_DISPOSITION,
  PAYMENT_MAX_AMOUNT,
  PAYMENT_MIN_AMOUNT,
  PAYMENT_PROVIDER_OUTCOME,
  PAYMENT_QUERY_LEASE_MS,
  PAYMENT_REFUND_REASON,
  PAYMENT_REFUND_STATE,
  PAYOS_STATUS,
} from './constants/payment.constant';
import { PaymentAttempt, PaymentRefund } from './entities';
import { PAYOS_CLIENT } from './payment.config';
import { PaymentPricing } from './payment.pricing';
import {
  canStartAttempt,
  captureDisposition,
  firstReconciliationAt,
  providerOutcome,
} from './policies/payment.policy';
import type { CreatePaymentInput } from './schemas/payment.schema';

/** Persisted provider capture and immutable order snapshots authorize money, never order fields alone. */
export async function verifiedPayosCapture(
  manager: EntityManager,
  order: Order,
) {
  if (order.paymentMethod !== ORDER_PAYMENT_METHOD.PAYOS || !order.paymentId)
    return null;
  const payment = await manager.findOneBy(PaymentAttempt, {
    id: order.paymentId,
  });
  if (!payment) return null;
  const checkout = await manager.findOneBy(Checkout, {
    id: payment.checkoutId,
  });
  const snapshot = payment.orders.find(
    (row) => row.checkoutOrderId === order.checkoutOrderId,
  );
  const refunded = await manager.existsBy(PaymentRefund, {
    paymentId: payment.id,
    providerTransId: payment.providerTransId ?? '',
  });
  const total = payment.orders.reduce(
    (sum, row) =>
      sum + row.subtotal + row.shippingFee - (row.coinDiscount ?? 0),
    0,
  );
  const captureMatches =
    payment.state === PAYMENT_ATTEMPT_STATE.PAID &&
    Boolean(payment.providerTransId) &&
    payment.paidAt &&
    payment.capturedAmount === payment.amount &&
    Number.isSafeInteger(payment.amount) &&
    payment.amount > 0 &&
    payment.amount === total &&
    !refunded &&
    payment.buyerId === order.buyerId &&
    payment.checkoutId === order.checkoutId &&
    checkout?.status === CHECKOUT_STATUS.PAID &&
    checkout.buyerId === order.buyerId &&
    (!order.deliveryObservedAt || payment.paidAt <= order.deliveryObservedAt);
  const snapshotMatches =
    snapshot &&
    order.commissionBasisPoints ===
      ORDER_POLICY.DEFAULT_COMMISSION_BASIS_POINTS &&
    snapshot.shopId === order.shopId &&
    snapshot.subtotal === order.subtotal &&
    snapshot.shippingFee === order.shippingFee &&
    (snapshot.coinDiscount ?? 0) === (order.coinDiscount ?? 0) &&
    (snapshot.coinMode ?? null) === (order.coinMode ?? null) &&
    (!(order.coinDiscount ?? 0) || order.coinMode === 'SIMULATION') &&
    order.total ===
      order.subtotal + order.shippingFee - (order.coinDiscount ?? 0) &&
    JSON.stringify(snapshot.items) === JSON.stringify(order.items) &&
    JSON.stringify(snapshot.address) === JSON.stringify(order.address);
  return captureMatches && snapshotMatches ? payment : null;
}

@Injectable()
export class PaymentService {
  constructor(
    private readonly db: DataSource,
    @Inject(PAYOS_CLIENT) private readonly payosClient: PayosClient | null,
    private readonly paymentPricing: PaymentPricing,
    private readonly outboxService: OutboxService,
    private readonly coinService: CoinService,
  ) {}

  private gateway() {
    if (!this.payosClient)
      throw new ServiceUnavailableException('PayOS gateway is disabled');
    return this.payosClient;
  }

  private async now(manager: EntityManager): Promise<Date> {
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }

  async create(
    buyerId: string,
    checkoutId: string,
    { requestId }: CreatePaymentInput,
  ) {
    const gateway = this.gateway();
    const existing = await this.db.getRepository(PaymentAttempt).findOneBy({
      checkoutId,
      buyerId,
      requestId,
    });
    if (existing) return this.findMine(buyerId, existing.id);
    const quote = await this.paymentPricing.quote(buyerId, checkoutId);
    const prepared = await this.db.transaction(async (manager) =>
      this.prepareAttempt(manager, buyerId, checkoutId, requestId, quote),
    );
    if (!prepared.send) return this.findMine(buyerId, prepared.attempt.id);
    const attempt = prepared.attempt;
    const orderCode = Number(attempt.providerOrderCode);
    const expiredAt = Math.floor(prepared.expiresAt.getTime() / 1000);
    try {
      const result = await gateway.createPaymentLink({
        orderCode,
        amount: attempt.amount,
        description: `RW ${attempt.id.slice(0, 8).toUpperCase()}`,
        expiredAt,
      });
      await this.db.transaction(async (manager) => {
        const current = await manager.findOneOrFail(PaymentAttempt, {
          where: { id: attempt.id },
          lock: { mode: 'pessimistic_write' },
        });
        const attemptIsResolved = !(
          [
            PAYMENT_ATTEMPT_STATE.CREATING,
            PAYMENT_ATTEMPT_STATE.PENDING,
            PAYMENT_ATTEMPT_STATE.UNKNOWN,
          ] as readonly string[]
        ).includes(current.state);
        if (attemptIsResolved) return;
        const outcome = providerOutcome(result.status);
        current.state =
          result.status === PAYOS_STATUS.PENDING ||
          outcome === PAYMENT_PROVIDER_OUTCOME.PAID
            ? PAYMENT_ATTEMPT_STATE.PENDING
            : outcome === PAYMENT_PROVIDER_OUTCOME.FAILED
              ? PAYMENT_ATTEMPT_STATE.FAILED
              : PAYMENT_ATTEMPT_STATE.UNKNOWN;
        current.providerStatus = result.status;
        current.payUrl = result.checkoutUrl ?? null;
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
    const now = await this.now(manager);
    const checkout = await manager.findOneOrFail(Checkout, {
      where: { id: checkoutId, buyerId },
      lock: { mode: 'pessimistic_write' },
    });
    const attempts = await manager.find(PaymentAttempt, {
      where: { checkoutId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const previous = attempts.find((item) => item.requestId === requestId);
    if (previous) {
      return {
        attempt: previous,
        send: false,
        expiresAt: checkout.expiresAt ?? now,
      };
    }
    const expiresAt = checkout.expiresAt;
    if (
      checkout.status !== CHECKOUT_STATUS.HELD ||
      !expiresAt ||
      expiresAt <= now
    )
      throw new ConflictException('An active checkout is required');
    if (!canStartAttempt(attempts.map((item) => item.state)))
      throw new ConflictException(
        'Resolve the previous payment or the three-attempt limit before trying again',
      );
    if (
      await manager.existsBy(WalletCheckoutHold, {
        checkoutId,
        state: WALLET_HOLD_STATE.HELD,
      })
    )
      throw new ConflictException(
        'Release wallet reservation before choosing PayOS',
      );
    checkout.walletPaymentSelected = false;
    await manager.save(checkout);
    if (
      (checkout.coinDiscount ?? 0) > 0 &&
      checkout.coinMode !== RECONCILIATION_MODE.SIMULATION
    )
      throw new ConflictException('PayOS gateway requires simulation coins');
    const orders = await this.paymentPricing.snapshot(manager, checkout, quote);
    const amount = orders.reduce(
      (sum, order) =>
        sum + order.subtotal + order.shippingFee - (order.coinDiscount ?? 0),
      0,
    );
    if (
      !Number.isSafeInteger(amount) ||
      amount < PAYMENT_MIN_AMOUNT ||
      amount > PAYMENT_MAX_AMOUNT
    )
      throw new ConflictException('Checkout total is outside PayOS limits');
    const products = await this.lockProducts(manager, checkout);
    if (
      !this.ownsProducts(
        checkout,
        orders.flatMap((order) => order.items.map((item) => item.productId)),
        products,
      )
    )
      throw new ConflictException('Checkout stock is no longer reserved');
    const shopIds = [...new Set(orders.map((order) => order.shopId))].sort();
    const shops = shopIds.length
      ? await manager.find(Shop, {
          where: { id: In(shopIds), status: ShopStatus.ACTIVE },
          order: { id: 'ASC' },
          lock: { mode: 'pessimistic_read' },
        })
      : [];
    if (shops.length !== shopIds.length)
      throw new NotFoundException('Active shop not found');
    if (shops.some((shop) => !shopAllowsIdentitySales(shop, now)))
      throw new ConflictException('Shop identity requires review');
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
    return { attempt, send: true, expiresAt };
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
        providerOrderCode: String(generatePayosOrderCode()),
        amount,
        orders,
        state: PAYMENT_ATTEMPT_STATE.CREATING,
        payUrl: null,
        providerTransId: null,
        providerStatus: null,
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

  async webhook(body: unknown) {
    let verified: PayosWebhookResult;
    try {
      verified = await this.gateway().verifyWebhook(body);
    } catch {
      throw new UnauthorizedException('Invalid PayOS webhook');
    }
    if (verified.isTestPing) return;
    await this.applyWebhook(verified);
  }

  async applyWebhook(verified: PayosWebhookResult) {
    if (verified.isTestPing) return;
    const attempt = await this.db.getRepository(PaymentAttempt).findOneBy({
      providerOrderCode: String(verified.orderCode),
    });
    if (!attempt) {
      throw new UnauthorizedException('PayOS order reference mismatch');
    }
    await this.applyResult(attempt.id, {
      orderCode: verified.orderCode,
      status: verified.code === '00' ? PAYOS_STATUS.PAID : PAYOS_STATUS.PENDING,
      amount: verified.amount,
      amountPaid: verified.amount,
      providerTransId: verified.reference || null,
    });
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
    const orderCode = await this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      const attempt = await manager.findOneOrFail(PaymentAttempt, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      const attemptCannotBeQueried =
        !attempt.providerOrderCode ||
        !(
          [
            PAYMENT_ATTEMPT_STATE.CREATING,
            PAYMENT_ATTEMPT_STATE.PENDING,
            PAYMENT_ATTEMPT_STATE.UNKNOWN,
          ] as readonly string[]
        ).includes(attempt.state) ||
        attempt.nextQueryAt > now;
      if (attemptCannotBeQueried) return null;
      attempt.nextQueryAt = new Date(now.getTime() + PAYMENT_QUERY_LEASE_MS);
      await manager.save(attempt);
      return Number(attempt.providerOrderCode);
    });
    if (!orderCode) return;
    try {
      const result = await gateway.getPaymentLink(orderCode);
      await this.applyResult(id, result);
    } catch {
      /* Keep durable unknown state and lease. */
    }
  }

  async applyResult(id: string, result: PayosPaymentResult) {
    await this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      const attempt = await manager.findOneOrFail(PaymentAttempt, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        attempt.providerOrderCode &&
        Number(attempt.providerOrderCode) !== result.orderCode
      ) {
        throw new UnauthorizedException('PayOS order reference mismatch');
      }
      const providerTransId = result.providerTransId?.trim() || '';
      const hasCapturedFunds =
        result.status === PAYOS_STATUS.PAID ||
        (result.amountPaid > 0 &&
          (providerOutcome(result.status) === PAYMENT_PROVIDER_OUTCOME.FAILED ||
            result.status === PAYOS_STATUS.UNDERPAID));
      const attemptIsSettled = (
        [
          PAYMENT_ATTEMPT_STATE.PAID,
          PAYMENT_ATTEMPT_STATE.REFUND_REQUIRED,
          PAYMENT_ATTEMPT_STATE.REFUNDED,
        ] as readonly string[]
      ).includes(attempt.state);
      if (attemptIsSettled) {
        if (
          hasCapturedFunds &&
          providerTransId &&
          attempt.providerTransId !== providerTransId &&
          !isIncludedInAggregateTransId(
            attempt.providerTransId,
            providerTransId,
          )
        ) {
          const outstanding = await this.queueResultRefunds(
            manager,
            id,
            result,
            now,
          );
          if (attempt.state === PAYMENT_ATTEMPT_STATE.REFUNDED && outstanding) {
            attempt.state = PAYMENT_ATTEMPT_STATE.REFUND_REQUIRED;
            await manager.save(attempt);
          }
        }
        return;
      }
      const checkout = await manager.findOneOrFail(Checkout, {
        where: { id: attempt.checkoutId },
        lock: { mode: 'pessimistic_write' },
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
      attempt.providerStatus = result.status;
      if (outcome === PAYMENT_CAPTURE_DISPOSITION.FAILED)
        attempt.state = PAYMENT_ATTEMPT_STATE.FAILED;
      else if (outcome === PAYMENT_CAPTURE_DISPOSITION.UNKNOWN) {
        if (attempt.state !== PAYMENT_ATTEMPT_STATE.FAILED)
          attempt.state = PAYMENT_ATTEMPT_STATE.UNKNOWN;
      } else {
        if (
          !providerTransId ||
          !Number.isSafeInteger(result.amountPaid) ||
          result.amountPaid <= 0 ||
          result.amountPaid > MAX_VND_AMOUNT
        )
          throw new ConflictException(
            'Invalid captured funds require reconciliation',
          );
        attempt.providerTransId = providerTransId;
        attempt.capturedAmount = result.amountPaid;
        attempt.paidAt = now;
        if (outcome === PAYMENT_CAPTURE_DISPOSITION.REFUND) {
          attempt.state = PAYMENT_ATTEMPT_STATE.REFUND_REQUIRED;
          await this.queueResultRefunds(manager, id, result, now);
        } else {
          attempt.state = PAYMENT_ATTEMPT_STATE.PAID;
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
    result: PayosPaymentResult,
    now: Date,
  ) {
    const shopIds = [
      ...new Set(attempt.orders.map((order) => order.shopId)),
    ].sort();
    const shops = shopIds.length
      ? await manager.find(Shop, {
          where: { id: In(shopIds) },
          order: { id: 'ASC' },
          lock: { mode: 'pessimistic_read' },
        })
      : [];
    const shopsActive =
      shops.length === shopIds.length &&
      shops.every(
        (shop) =>
          shop.status === ShopStatus.ACTIVE &&
          shopAllowsIdentitySales(shop, now),
      );
    const expectedIds = attempt.orders.flatMap((order) =>
      order.items.map((item) => item.productId),
    );
    return captureDisposition({
      amount: result.amountPaid,
      expectedAmount: attempt.amount,
      status: result.status,
      checkoutState: checkout.status,
      expiresAt: checkout.expiresAt?.getTime() ?? 0,
      now: now.getTime(),
      alreadyPaid: await manager.existsBy(Order, {
        checkoutOrderId: In(
          attempt.orders.map((order) => order.checkoutOrderId),
        ),
      }),
      ownsAllProducts:
        attempt.orders.reduce(
          (sum, row) => sum + (row.coinDiscount ?? 0),
          0,
        ) === (checkout.coinDiscount ?? 0) &&
        attempt.orders.every(
          (row) =>
            !(row.coinDiscount ?? 0) || row.coinMode === checkout.coinMode,
        ) &&
        !checkout.walletPaymentSelected &&
        !checkout.identityReviewRequired &&
        (!checkout.walletSelectedAt ||
          attempt.createdAt >= checkout.walletSelectedAt) &&
        shopsActive &&
        this.ownsProducts(checkout, expectedIds, products),
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
    const createdOrders = await manager.find(Order, {
      where: { checkoutId: checkout.id },
    });
    await this.coinService.consumeCheckoutCoins(
      manager,
      checkout.id,
      createdOrders,
      RECONCILIATION_MODE.SIMULATION,
      now,
    );
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
        paymentMethod: ORDER_PAYMENT_METHOD.PAYOS,
        paymentId: attempt.id,
        buyerId: attempt.buyerId,
        shopId,
        shopName,
        subtotal,
        shippingFee,
        coinDiscount: snapshot.coinDiscount ?? 0,
        coinMode: snapshot.coinMode ?? null,
        total: subtotal + shippingFee - (snapshot.coinDiscount ?? 0),
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

  private async queueResultRefunds(
    manager: EntityManager,
    paymentId: string,
    result: PayosPaymentResult,
    now: Date,
  ) {
    const parts =
      result.transactions && result.transactions.length > 1
        ? result.transactions.map((tx) => ({
            ...result,
            amountPaid: tx.amount,
            providerTransId: tx.providerTransId,
          }))
        : [result];
    let outstanding = false;
    for (const part of parts) {
      if (await this.queueRefund(manager, paymentId, part, now)) {
        outstanding = true;
      }
    }
    return outstanding;
  }

  private async queueRefund(
    manager: EntityManager,
    paymentId: string,
    result: PayosPaymentResult,
    now: Date,
  ) {
    const providerTransId = result.providerTransId?.trim() || '';
    if (
      !providerTransId ||
      !Number.isSafeInteger(result.amountPaid) ||
      result.amountPaid <= 0 ||
      result.amountPaid > MAX_VND_AMOUNT
    )
      throw new ConflictException(
        'Invalid captured funds require reconciliation',
      );
    const previous = await manager.findOneBy(PaymentRefund, {
      providerTransId,
    });
    if (previous) {
      if (
        previous.paymentId !== paymentId ||
        previous.amount !== result.amountPaid
      )
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
        amount: result.amountPaid,
        reason: PAYMENT_REFUND_REASON.LATE_OR_INVALID_CAPTURE,
        state: PAYMENT_REFUND_STATE.REVIEW_REQUIRED,
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
