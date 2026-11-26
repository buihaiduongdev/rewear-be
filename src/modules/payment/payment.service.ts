import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
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
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';
import { WALLET_HOLD_STATE } from '@/modules/wallet/constants/wallet.constant';
import { WalletCheckoutHold } from '@/modules/wallet/entities';
import { WalletService } from '@/modules/wallet/wallet.service';

import {
  PAYMENT_ATTEMPT_STATE,
  PAYMENT_CAPTURE_DISPOSITION,
  PAYMENT_MAX_AMOUNT,
  PAYMENT_MIN_AMOUNT,
  PAYMENT_PROVIDER,
  PAYMENT_PROVIDER_OUTCOME,
  PAYMENT_QUERY_LEASE_MS,
  PAYMENT_REFUND_REASON,
  PAYMENT_REFUND_RESOLUTION,
  PAYMENT_REFUND_STATE,
  PAYOS_STATUS,
} from './constants/payment.constant';
import { PaymentAttempt, PaymentRefund } from './entities';
import { MomoClient, type MomoVerifiedIpn } from './momo.client';
import { MOMO_CLIENT, PAYOS_CLIENT } from './payment.config';
import { PaymentPricing } from './payment.pricing';
import {
  canStartAttempt,
  captureDisposition,
  firstReconciliationAt,
  providerOutcome,
} from './policies/payment.policy';
import type {
  AdminPaymentRefundQuery,
  CreatePaymentInput,
  PaymentProvider,
  ResolvePaymentRefundInput,
} from './schemas/payment.schema';

/** Persisted provider capture and immutable order snapshots authorize money, never order fields alone. */
export async function verifiedPayosCapture(
  manager: EntityManager,
  order: Order,
) {
  const isGatewayOrder =
    order.paymentMethod === ORDER_PAYMENT_METHOD.PAYOS ||
    order.paymentMethod === ORDER_PAYMENT_METHOD.MOMO;
  if (!isGatewayOrder || !order.paymentId) return null;
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
    @Optional()
    @Inject(MOMO_CLIENT)
    private readonly momoClient: MomoClient | null = null,
    @Optional()
    @Inject(forwardRef(() => WalletService))
    private readonly walletService?: WalletService,
  ) {}

  private payosGateway() {
    if (!this.payosClient)
      throw new ServiceUnavailableException('PayOS gateway is disabled');
    return this.payosClient;
  }

  private momoGateway() {
    if (!this.momoClient)
      throw new ServiceUnavailableException('MoMo gateway is disabled');
    return this.momoClient;
  }

  private async now(manager: EntityManager): Promise<Date> {
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }

  private async assertAdmin(manager: EntityManager, actorId: string) {
    const admin = await manager.findOneBy(User, {
      id: actorId,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });
    if (!admin) throw new ForbiddenException('Active Admin required');
  }

  async create(
    buyerId: string,
    checkoutId: string,
    { requestId }: CreatePaymentInput,
    provider: PaymentProvider = PAYMENT_PROVIDER.PAYOS,
  ) {
    if (provider === PAYMENT_PROVIDER.MOMO) this.momoGateway();
    else this.payosGateway();

    const existing = await this.db.getRepository(PaymentAttempt).findOneBy({
      checkoutId,
      buyerId,
      requestId,
    });
    if (existing) return this.findMine(buyerId, existing.id);
    const quote = await this.paymentPricing.quote(buyerId, checkoutId);
    const prepared = await this.db.transaction(async (manager) =>
      this.prepareAttempt(
        manager,
        buyerId,
        checkoutId,
        requestId,
        quote,
        provider,
      ),
    );
    if (!prepared.send) return this.findMine(buyerId, prepared.attempt.id);
    const attempt = prepared.attempt;
    const orderCode = Number(attempt.providerOrderCode);
    const expiredAt = Math.floor(prepared.expiresAt.getTime() / 1000);
    try {
      const created =
        provider === PAYMENT_PROVIDER.MOMO
          ? await this.createMomoLink(attempt)
          : await this.createPayosLink(attempt, orderCode, expiredAt);
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
        const outcome = providerOutcome(created.status);
        current.state =
          created.status === PAYOS_STATUS.PENDING ||
          outcome === PAYMENT_PROVIDER_OUTCOME.PAID
            ? PAYMENT_ATTEMPT_STATE.PENDING
            : outcome === PAYMENT_PROVIDER_OUTCOME.FAILED
              ? PAYMENT_ATTEMPT_STATE.FAILED
              : PAYMENT_ATTEMPT_STATE.UNKNOWN;
        current.providerStatus = created.status;
        current.payUrl = created.payUrl;
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

  private async createPayosLink(
    attempt: PaymentAttempt,
    orderCode: number,
    expiredAt: number,
  ) {
    const result = await this.payosGateway().createPaymentLink({
      orderCode,
      amount: attempt.amount,
      description: `RW ${attempt.id.slice(0, 8).toUpperCase()}`,
      expiredAt,
    });
    return {
      status: result.status,
      payUrl: result.checkoutUrl ?? null,
    };
  }

  private async createMomoLink(attempt: PaymentAttempt) {
    const result = await this.momoGateway().createPayment({
      orderId: attempt.providerOrderCode!,
      requestId: attempt.requestId,
      amount: attempt.amount,
      orderInfo: `Rewear order ${attempt.id.slice(0, 8).toUpperCase()}`,
    });
    return {
      status: result.status,
      payUrl: result.payUrl,
    };
  }

  private async prepareAttempt(
    manager: EntityManager,
    buyerId: string,
    checkoutId: string,
    requestId: string,
    quote: Awaited<ReturnType<PaymentPricing['quote']>>,
    provider: PaymentProvider,
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
    const gatewayName = provider === PAYMENT_PROVIDER.MOMO ? 'MoMo' : 'PayOS';
    if (
      await manager.existsBy(WalletCheckoutHold, {
        checkoutId,
        state: WALLET_HOLD_STATE.HELD,
      })
    )
      throw new ConflictException(
        `Release wallet reservation before choosing ${gatewayName}`,
      );
    checkout.walletPaymentSelected = false;
    await manager.save(checkout);
    if (
      (checkout.coinDiscount ?? 0) > 0 &&
      checkout.coinMode !== RECONCILIATION_MODE.SIMULATION
    )
      throw new ConflictException(
        `${gatewayName} gateway requires simulation coins`,
      );
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
      throw new ConflictException(
        `Checkout total is outside ${gatewayName} limits`,
      );
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
      provider,
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
    provider: PaymentProvider,
    amount: number,
    orders: PaymentAttempt['orders'],
    now: Date,
    expiresAt: Date,
  ) {
    return manager.save(
      PaymentAttempt,
      manager.create(PaymentAttempt, {
        id: randomUUID(),
        provider,
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
      provider: attempt.provider ?? PAYMENT_PROVIDER.PAYOS,
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
      verified = await this.payosGateway().verifyWebhook(body);
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

  async applyMomoIpn(verified: MomoVerifiedIpn) {
    const attempt = await this.db.getRepository(PaymentAttempt).findOneBy({
      providerOrderCode: verified.orderId,
      provider: PAYMENT_PROVIDER.MOMO,
    });
    if (!attempt) {
      throw new UnauthorizedException('MoMo order reference mismatch');
    }
    await this.applyResult(attempt.id, {
      orderCode: Number(attempt.providerOrderCode),
      status: verified.status as PayosPaymentResult['status'],
      amount: verified.amount,
      amountPaid: verified.status === PAYOS_STATUS.PAID ? verified.amount : 0,
      providerTransId: verified.transId || null,
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
    const target = await this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      const attempt = await manager.findOneOrFail(PaymentAttempt, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      const orderCode = attempt.providerOrderCode;
      const attemptCannotBeQueried =
        !orderCode ||
        !(
          [
            PAYMENT_ATTEMPT_STATE.CREATING,
            PAYMENT_ATTEMPT_STATE.PENDING,
            PAYMENT_ATTEMPT_STATE.UNKNOWN,
          ] as readonly string[]
        ).includes(attempt.state) ||
        attempt.nextQueryAt > now;
      if (attemptCannotBeQueried || !orderCode) return null;
      attempt.nextQueryAt = new Date(now.getTime() + PAYMENT_QUERY_LEASE_MS);
      await manager.save(attempt);
      return {
        provider: attempt.provider ?? PAYMENT_PROVIDER.PAYOS,
        orderCode,
        requestId: attempt.requestId,
      };
    });
    if (!target) return;

    const result =
      target.provider === PAYMENT_PROVIDER.MOMO
        ? await this.queryMomoAttempt(target.orderCode, target.requestId)
        : await this.queryPayosAttempt(Number(target.orderCode));
    if (result) {
      await this.applyResult(id, result);
    }
  }

  private async queryPayosAttempt(orderCode: number) {
    const gateway = this.payosGateway();
    try {
      return await gateway.getPaymentLink(orderCode);
    } catch {
      /* Keep durable unknown state and lease. */
      return null;
    }
  }

  private async queryMomoAttempt(
    orderId: string,
    requestId: string,
  ): Promise<PayosPaymentResult | null> {
    const gateway = this.momoGateway();
    try {
      const info = await gateway.queryStatus(orderId, requestId);
      return {
        orderCode: Number(orderId),
        status: info.status as PayosPaymentResult['status'],
        amount: info.amount,
        amountPaid: info.amountPaid,
        providerTransId: info.providerTransId,
      };
    } catch {
      /* Keep durable unknown state and lease. */
      return null;
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
        paymentMethod:
          attempt.provider === PAYMENT_PROVIDER.MOMO
            ? ORDER_PAYMENT_METHOD.MOMO
            : ORDER_PAYMENT_METHOD.PAYOS,
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
        state: PAYMENT_REFUND_STATE.QUEUED,
        nextQueryAt: now,
        alertedAt: null,
        resolutionMethod: null,
        resolutionNote: null,
        resolvedById: null,
        resolvedAt: null,
      }),
    );
    return true;
  }

  async listRefundsForAdmin(actorId: string, query: AdminPaymentRefundQuery) {
    const manager = this.db.manager;
    await this.assertAdmin(manager, actorId);
    const refunds = await manager.find(PaymentRefund, {
      where: query.state ? { state: query.state } : {},
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const paymentIds = [...new Set(refunds.map((row) => row.paymentId))];
    const attempts = paymentIds.length
      ? await manager.find(PaymentAttempt, { where: { id: In(paymentIds) } })
      : [];
    const attemptById = new Map(attempts.map((row) => [row.id, row]));
    return {
      refunds: refunds.map((refund) => {
        const attempt = attemptById.get(refund.paymentId);
        return {
          ...refund,
          checkoutId: attempt?.checkoutId ?? null,
          buyerId: attempt?.buyerId ?? null,
          provider: attempt?.provider ?? PAYMENT_PROVIDER.PAYOS,
        };
      }),
    };
  }

  async resolveRefund(
    actorId: string,
    refundId: string,
    input: ResolvePaymentRefundInput,
  ) {
    return this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      await this.assertAdmin(manager, actorId);
      const refund = await manager.findOne(PaymentRefund, {
        where: { id: refundId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!refund) {
        throw new NotFoundException('Payment refund not found');
      }
      if (refund.state === PAYMENT_REFUND_STATE.COMPLETED) {
        throw new ConflictException('Payment refund is already completed');
      }
      const attempt = await manager.findOneOrFail(PaymentAttempt, {
        where: { id: refund.paymentId },
        lock: { mode: 'pessimistic_write' },
      });

      if (input.action === 'CREDIT_WALLET') {
        if (!this.walletService) {
          throw new ServiceUnavailableException('Wallet service unavailable');
        }
        await this.walletService.creditLatePaymentRefund(manager, {
          userId: attempt.buyerId,
          paymentRefundId: refund.id,
          amount: refund.amount,
          mode: RECONCILIATION_MODE.SIMULATION,
        });
        refund.resolutionMethod = PAYMENT_REFUND_RESOLUTION.WALLET_CREDIT;
        refund.resolutionNote =
          input.note ?? 'Credited to buyer refund wallet by admin';
      } else {
        refund.resolutionMethod = PAYMENT_REFUND_RESOLUTION.MANUAL_TRANSFER;
        refund.resolutionNote = [input.bankReference, input.note]
          .filter(Boolean)
          .join(' — ');
      }

      refund.state = PAYMENT_REFUND_STATE.COMPLETED;
      refund.resolvedById = actorId;
      refund.resolvedAt = now;
      await manager.save(refund);

      const siblings = await manager.find(PaymentRefund, {
        where: { paymentId: attempt.id },
      });
      if (
        attempt.state === PAYMENT_ATTEMPT_STATE.REFUND_REQUIRED &&
        siblings.length > 0 &&
        siblings.every((row) => row.state === PAYMENT_REFUND_STATE.COMPLETED)
      ) {
        attempt.state = PAYMENT_ATTEMPT_STATE.REFUNDED;
        await manager.save(attempt);
      }

      return {
        ...refund,
        checkoutId: attempt.checkoutId,
        buyerId: attempt.buyerId,
        provider: attempt.provider ?? PAYMENT_PROVIDER.PAYOS,
      };
    });
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
