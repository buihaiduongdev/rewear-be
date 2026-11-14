import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { MomoSandboxClient } from '@/infrastructure/payment/momo-sandbox.client';
import type {
  MomoNotification,
  MomoResult,
} from '@/infrastructure/payment/momo-sandbox.client';
import { Cart, CartItem } from '@/modules/cart/entities';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { Order, OrderEvent } from '@/modules/order/order.entity';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';

import { MOMO_CLIENT } from './payment.config';
import { PaymentAttempt, PaymentRefund } from './payment.entity';
import {
  canStartAttempt,
  captureDisposition,
  firstReconciliationAt,
  providerOutcome,
} from './payment.policy';
import { PaymentPricing } from './payment.pricing';

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
      if (
        checkout.status !== 'HELD' ||
        !checkout.expiresAt ||
        checkout.expiresAt <= now
      )
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
      if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 50000000)
        throw new ConflictException('Checkout total is outside MoMo limits');
      const products = await this.lockProducts(manager, checkout);
      if (
        !this.ownsProducts(
          checkout,
          orders.flatMap((order) => order.items.map((item) => item.productId)),
          products,
        )
      )
        throw new ConflictException('Checkout stock is no longer reserved');
      for (const shopId of [
        ...new Set(orders.map((order) => order.shopId)),
      ].sort()) {
        await manager.findOneOrFail(Shop, {
          where: { id: shopId, status: ShopStatus.ACTIVE },
          lock: { mode: 'pessimistic_read' },
        });
      }
      const attempt = await manager.save(
        PaymentAttempt,
        manager.create(PaymentAttempt, {
          id: randomUUID(),
          checkoutId,
          buyerId,
          requestId,
          amount,
          orders,
          state: 'CREATING',
          payUrl: null,
          providerTransId: null,
          resultCode: null,
          capturedAmount: null,
          paidAt: null,
          nextQueryAt: new Date(
            firstReconciliationAt(now.getTime(), checkout.expiresAt.getTime()),
          ),
        }),
      );
      return { attempt, send: true };
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
        if (!['CREATING', 'PENDING', 'UNKNOWN'].includes(current.state)) return;
        current.state =
          result.resultCode === 0
            ? 'PENDING'
            : providerOutcome(result.resultCode) === 'FAILED'
              ? 'FAILED'
              : 'UNKNOWN';
        current.resultCode = result.resultCode;
        current.payUrl = result.payUrl ?? null;
        await manager.save(current);
      });
    } catch {
      await this.db
        .getRepository(PaymentAttempt)
        .update({ id: attempt.id, state: 'CREATING' }, { state: 'UNKNOWN' });
    }
    return this.findMine(buyerId, attempt.id);
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
      payUrl: attempt.state === 'PENDING' ? attempt.payUrl : null,
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
    if (
      result.requestId !== result.orderId ||
      result.orderInfo !==
        `Rewear ${(await this.db.getRepository(PaymentAttempt).findOneByOrFail({ id: result.orderId })).checkoutId}` ||
      result.orderType !== 'momo_wallet'
    )
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
      if (
        !['CREATING', 'PENDING', 'UNKNOWN'].includes(attempt.state) ||
        attempt.nextQueryAt > now
      )
        return false;
      // Lease is longer than maximum configured HTTP timeout (60 seconds).
      attempt.nextQueryAt = new Date(now.getTime() + 75000);
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
      if (['PAID', 'REFUND_REQUIRED', 'REFUNDED'].includes(attempt.state)) {
        if (
          result.resultCode === 0 &&
          attempt.providerTransId !== String(result.transId)
        ) {
          const outstanding = await this.queueRefund(manager, id, result, now);
          if (attempt.state === 'REFUNDED' && outstanding) {
            attempt.state = 'REFUND_REQUIRED';
            await manager.save(attempt);
          }
        }
        return;
      }
      const checkout = await manager.findOneByOrFail(Checkout, {
        id: attempt.checkoutId,
      });
      const products = await this.lockProducts(manager, checkout);
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
      const outcome = captureDisposition({
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
      attempt.resultCode = result.resultCode;
      if (outcome === 'FAILED') attempt.state = 'FAILED';
      else if (outcome === 'UNKNOWN') {
        if (attempt.state !== 'FAILED') attempt.state = 'UNKNOWN';
      } else {
        if (
          !Number.isSafeInteger(result.transId) ||
          result.transId <= 0 ||
          !Number.isSafeInteger(result.amount) ||
          result.amount <= 0 ||
          result.amount > 2147483647
        )
          throw new ConflictException(
            'Invalid captured funds require reconciliation',
          );
        attempt.providerTransId = String(result.transId);
        attempt.capturedAmount = result.amount;
        attempt.paidAt = now;
        if (outcome === 'REFUND') {
          attempt.state = 'REFUND_REQUIRED';
          await this.queueRefund(manager, id, result, now);
        } else {
          attempt.state = 'PAID';
          // Save payment first for order FK. All writes roll back together.
          await manager.save(attempt);
          for (const snapshot of attempt.orders) {
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
                paymentMethod: 'MOMO',
                paymentId: id,
                buyerId: attempt.buyerId,
                shopId,
                shopName,
                subtotal,
                shippingFee,
                total: subtotal + shippingFee,
                address,
                items,
                status: 'pending',
                commissionBasisPoints: 300,
                sellerConfirmBy: new Date(now.getTime() + 86400000),
              }),
            );
            await manager.save(
              OrderEvent,
              manager.create(OrderEvent, {
                orderId: order.id,
                action: 'PAID',
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
          checkout.status = 'PAID';
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
      }
      const remaining = (checkout.expiresAt?.getTime() ?? 0) - now.getTime();
      attempt.nextQueryAt = new Date(
        now.getTime() + (remaining > 0 && remaining <= 120000 ? 15000 : 60000),
      );
      await manager.save(attempt);
    });
  }

  private async queueRefund(
    manager: EntityManager,
    paymentId: string,
    result: MomoResult,
    now: Date,
  ) {
    if (
      !Number.isSafeInteger(result.transId) ||
      result.transId <= 0 ||
      !Number.isSafeInteger(result.amount) ||
      result.amount <= 0 ||
      result.amount > 2147483647
    )
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
      return previous.state !== 'COMPLETED';
    }
    await manager.save(
      PaymentRefund,
      manager.create(PaymentRefund, {
        paymentId,
        providerTransId,
        amount: result.amount,
        reason: 'LATE_OR_INVALID_CAPTURE',
        state:
          result.amount < 1000 || result.amount > 50000000
            ? 'REVIEW_REQUIRED'
            : 'QUEUED',
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
