import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { MAX_VND_AMOUNT } from '@/common/constants/money.constant';
import { Cart, CartItem } from '@/modules/cart/entities';
import { CHECKOUT_STATUS } from '@/modules/checkout/constants/checkout.constant';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
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
import { PAYMENT_ATTEMPT_STATE } from '@/modules/payment/constants/payment.constant';
import { PaymentAttempt } from '@/modules/payment/entities';
import { PaymentPricing } from '@/modules/payment/payment.pricing';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { shopAllowsIdentitySales } from '@/modules/shop/applications/constants/shop-application.constant';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';

import { WALLET_HOLD_STATE } from './constants/wallet.constant';
import { WalletAccount, WalletCheckoutHold, WalletDebit } from './entities';
import { walletBalanceSchema } from './schemas/wallet.schema';
import type { ReserveWalletCheckoutInput } from './schemas/wallet.schema';
import { releaseWalletHold, walletPoolFields } from './wallet-hold.helper';

export { releaseWalletHold, walletPoolFields };

export function walletCheckoutTotal(
  orders: { subtotal: number; shippingFee: number; coinDiscount?: number }[],
  expected: number,
) {
  const total = orders.reduce(
    (sum, row) =>
      sum + row.subtotal + row.shippingFee - (row.coinDiscount ?? 0),
    0,
  );
  if (
    !orders.length ||
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    total > MAX_VND_AMOUNT ||
    total !== expected
  )
    throw new ConflictException(
      'Wallet total changed; review the shipping quote',
    );
  return total;
}

export async function verifiedWalletCapture(
  manager: EntityManager,
  order: Order,
) {
  if (
    order.paymentMethod !== ORDER_PAYMENT_METHOD.WALLET ||
    !order.walletDebitId
  )
    return null;
  const debit = await manager.findOneBy(WalletDebit, {
    id: order.walletDebitId,
  });
  if (!debit) return null;
  const [hold, checkout] = await Promise.all([
    manager.findOneBy(WalletCheckoutHold, { id: debit.holdId }),
    manager.findOneBy(Checkout, { id: debit.checkoutId }),
  ]);
  const snapshot = hold?.orders.find(
    (row) => row.checkoutOrderId === order.checkoutOrderId,
  );
  const captureMatches =
    hold?.state === WALLET_HOLD_STATE.CAPTURED &&
    hold.capturedAt &&
    hold.buyerId === debit.buyerId &&
    hold.checkoutId === debit.checkoutId &&
    hold.mode === debit.mode &&
    hold.amount === debit.amount &&
    hold.amount ===
      hold.orders.reduce(
        (sum, row) =>
          sum + row.subtotal + row.shippingFee - (row.coinDiscount ?? 0),
        0,
      ) &&
    (!order.deliveryObservedAt || hold.capturedAt <= order.deliveryObservedAt);
  const checkoutMatches =
    checkout?.status === CHECKOUT_STATUS.PAID &&
    checkout.buyerId === order.buyerId &&
    debit.buyerId === order.buyerId &&
    debit.checkoutId === order.checkoutId &&
    order.commissionBasisPoints ===
      ORDER_POLICY.DEFAULT_COMMISSION_BASIS_POINTS;
  const snapshotMatches =
    snapshot?.shopId === order.shopId &&
    snapshot.subtotal === order.subtotal &&
    snapshot.shippingFee === order.shippingFee &&
    order.total ===
      order.subtotal + order.shippingFee - (order.coinDiscount ?? 0) &&
    (snapshot.coinDiscount ?? 0) === (order.coinDiscount ?? 0) &&
    (snapshot.coinMode ?? null) === (order.coinMode ?? null) &&
    (!(order.coinDiscount ?? 0) || order.coinMode === debit.mode) &&
    JSON.stringify(snapshot.items) === JSON.stringify(order.items) &&
    JSON.stringify(snapshot.address) === JSON.stringify(order.address);
  return captureMatches && checkoutMatches && snapshotMatches ? debit : null;
}

@Injectable()
export class WalletCheckoutService {
  constructor(
    private readonly db: DataSource,
    private readonly paymentPricing: PaymentPricing,
    private readonly outboxService: OutboxService,
    private readonly coinService: CoinService,
  ) {}

  private async now(manager: EntityManager) {
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }

  private async lockHold(manager: EntityManager, buyerId: string, id: string) {
    const target = await manager.findOneByOrFail(WalletCheckoutHold, {
      id,
      buyerId,
    });
    const checkout = await manager.findOneOrFail(Checkout, {
      where: { id: target.checkoutId, buyerId },
      lock: { mode: 'pessimistic_write' },
    });
    const hold = await manager.findOneOrFail(WalletCheckoutHold, {
      where: { id, buyerId },
      lock: { mode: 'pessimistic_write' },
    });
    return { checkout, hold };
  }

  async reserve(
    buyerId: string,
    checkoutId: string,
    input: ReserveWalletCheckoutInput,
  ) {
    const quote = await this.paymentPricing.quote(buyerId, checkoutId);
    return this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      await manager.findOne(User, {
        where: { id: buyerId },
        lock: { mode: 'pessimistic_write' },
      });
      const checkout = await manager.findOneOrFail(Checkout, {
        where: { id: checkoutId, buyerId },
        lock: { mode: 'pessimistic_write' },
      });
      await this.expireDue(manager, buyerId, now);
      if (
        checkout.status !== CHECKOUT_STATUS.HELD ||
        !checkout.expiresAt ||
        checkout.expiresAt <= now
      )
        throw new ConflictException('An active checkout is required');
      if (
        await manager.existsBy(WalletCheckoutHold, {
          checkoutId,
          state: WALLET_HOLD_STATE.HELD,
        })
      )
        throw new ConflictException(
          'Release the existing wallet reservation first',
        );
      const attempts = await manager.find(PaymentAttempt, {
        where: { checkoutId },
      });
      if (
        attempts.some(
          (row) =>
            row.state !== PAYMENT_ATTEMPT_STATE.FAILED &&
            row.state !== PAYMENT_ATTEMPT_STATE.REFUNDED,
        )
      )
        throw new ConflictException(
          'Resolve external payment before choosing wallet',
        );
      if ((checkout.coinDiscount ?? 0) > 0 && checkout.coinMode !== input.mode)
        throw new ConflictException('Wallet and coins must use the same mode');
      const orders = await this.paymentPricing.snapshot(
        manager,
        checkout,
        quote,
      );
      const amount = walletCheckoutTotal(orders, input.expectedTotal);
      const stockCheckedAt = await this.validateStock(
        manager,
        checkout,
        orders,
      );
      if (!checkout.expiresAt || checkout.expiresAt <= stockCheckedAt)
        throw new ConflictException('Checkout expired during stock validation');
      const account = await manager.findOne(WalletAccount, {
        where: { userId: buyerId },
        lock: { mode: 'pessimistic_write' },
      });
      const [available, held] = walletPoolFields(input.mode);
      if (!account || account[available] < amount)
        throw new ConflictException('Insufficient verified wallet funds');
      if (
        !walletBalanceSchema.safeParse(account[available] + account[held])
          .success
      )
        throw new ConflictException('Wallet balance requires reconciliation');
      account[available] -= amount;
      account[held] += amount;
      await manager.save(account);
      checkout.walletPaymentSelected = true;
      checkout.walletSelectedAt = now;
      await manager.save(checkout);
      return manager.save(
        WalletCheckoutHold,
        manager.create(WalletCheckoutHold, {
          checkoutId,
          buyerId,
          mode: input.mode,
          state: WALLET_HOLD_STATE.HELD,
          amount,
          orders,
          expiresAt: checkout.expiresAt,
          capturedAt: null,
          releasedAt: null,
        }),
      );
    });
  }

  async findMine(buyerId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      const { hold } = await this.lockHold(manager, buyerId, id);
      if (hold.state === WALLET_HOLD_STATE.HELD && hold.expiresAt <= now)
        await releaseWalletHold(manager, hold, now, WALLET_HOLD_STATE.EXPIRED);
      return hold;
    });
  }

  async release(buyerId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      const { hold } = await this.lockHold(manager, buyerId, id);
      await releaseWalletHold(manager, hold, now, WALLET_HOLD_STATE.RELEASED);
      return hold;
    });
  }

  async confirm(buyerId: string, id: string) {
    const result = await this.db.transaction(async (manager) => {
      const now = await this.now(manager);
      const { checkout, hold } = await this.lockHold(manager, buyerId, id);
      if (hold.state === WALLET_HOLD_STATE.CAPTURED) return hold;
      if (hold.state === WALLET_HOLD_STATE.HELD && hold.expiresAt <= now) {
        await releaseWalletHold(manager, hold, now, WALLET_HOLD_STATE.EXPIRED);
        return null;
      }
      if (hold.state !== WALLET_HOLD_STATE.HELD)
        throw new ConflictException('Wallet reservation is no longer active');
      if (
        checkout.status !== CHECKOUT_STATUS.HELD ||
        !checkout.expiresAt ||
        checkout.expiresAt <= now ||
        checkout.expiresAt.getTime() !== hold.expiresAt.getTime()
      )
        throw new ConflictException('Checkout is no longer active');
      const stockCheckedAt = await this.validateStock(
        manager,
        checkout,
        hold.orders,
      );
      if (hold.expiresAt <= stockCheckedAt) {
        await releaseWalletHold(
          manager,
          hold,
          stockCheckedAt,
          WALLET_HOLD_STATE.EXPIRED,
        );
        return null;
      }
      const debit = await this.captureHeldFunds(manager, hold, stockCheckedAt);
      await this.createOrders(manager, hold, checkout, debit, stockCheckedAt);
      const createdOrders = await manager.find(Order, {
        where: { checkoutId: checkout.id },
      });
      await this.coinService.consumeCheckoutCoins(
        manager,
        checkout.id,
        createdOrders,
        hold.mode,
        stockCheckedAt,
      );
      checkout.status = CHECKOUT_STATUS.PAID;
      await manager.save(checkout);
      const cart = await manager.findOneBy(Cart, { userId: buyerId });
      if (cart)
        await manager.delete(CartItem, {
          cartId: cart.id,
          productId: In(
            hold.orders.flatMap((row) =>
              row.items.map((item) => item.productId),
            ),
          ),
        });
      return hold;
    });
    if (!result) throw new ConflictException('Wallet reservation expired');
    return result;
  }

  private async captureHeldFunds(
    manager: EntityManager,
    hold: WalletCheckoutHold,
    now: Date,
  ) {
    const account = await manager.findOneOrFail(WalletAccount, {
      where: { userId: hold.buyerId },
      lock: { mode: 'pessimistic_write' },
    });
    const [available, held] = walletPoolFields(hold.mode);
    if (
      account[held] < hold.amount ||
      !walletBalanceSchema.safeParse(account[available] + account[held]).success
    )
      throw new ConflictException('Wallet hold requires reconciliation');
    account[held] -= hold.amount;
    await manager.save(account);
    const debit = await manager.save(
      WalletDebit,
      manager.create(WalletDebit, {
        holdId: hold.id,
        buyerId: hold.buyerId,
        checkoutId: hold.checkoutId,
        mode: hold.mode,
        amount: hold.amount,
      }),
    );
    hold.state = WALLET_HOLD_STATE.CAPTURED;
    hold.capturedAt = now;
    await manager.save(hold);
    return debit;
  }

  private async createOrders(
    manager: EntityManager,
    hold: WalletCheckoutHold,
    checkout: Checkout,
    debit: WalletDebit,
    now: Date,
  ) {
    for (const snapshot of hold.orders) {
      const order = await manager.save(
        Order,
        manager.create(Order, {
          ...snapshot,
          checkoutId: hold.checkoutId,
          buyerId: hold.buyerId,
          paymentId: null,
          walletDebitId: debit.id,
          paymentMethod: ORDER_PAYMENT_METHOD.WALLET,
          status: ORDER_STATUS.PENDING,
          total:
            snapshot.subtotal +
            snapshot.shippingFee -
            (snapshot.coinDiscount ?? 0),
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
          actorId: hold.buyerId,
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
          id: In(snapshot.items.map((row) => row.productId)),
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
  }

  private async expireDue(manager: EntityManager, buyerId: string, now: Date) {
    const holds = await manager.find(WalletCheckoutHold, {
      where: { buyerId, state: WALLET_HOLD_STATE.HELD },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    for (const hold of holds)
      if (hold.expiresAt <= now)
        await releaseWalletHold(manager, hold, now, WALLET_HOLD_STATE.EXPIRED);
  }

  private async validateStock(
    manager: EntityManager,
    checkout: Checkout,
    orders: WalletCheckoutHold['orders'],
  ) {
    const ids = orders.flatMap((row) =>
      row.items.map((item) => item.productId),
    );
    const products = await manager.find(Product, {
      where: { id: In(ids) },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !ids.length ||
      new Set(ids).size !== ids.length ||
      products.length !== ids.length ||
      products.some(
        (row) =>
          row.status !== ProductStatus.HELD ||
          row.reservationId !== checkout.id ||
          !row.heldUntil ||
          row.heldUntil.getTime() !== checkout.expiresAt?.getTime(),
      )
    )
      throw new ConflictException('Checkout stock is no longer reserved');
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    const current = new Date(now);
    const shopIds = [...new Set(orders.map((row) => row.shopId))].sort();
    const shops = shopIds.length
      ? await manager.find(Shop, {
          where: { id: In(shopIds), status: ShopStatus.ACTIVE },
          order: { id: 'ASC' },
          lock: { mode: 'pessimistic_read' },
        })
      : [];
    if (shops.length !== shopIds.length)
      throw new NotFoundException('Active shop not found');
    if (shops.some((shop) => !shopAllowsIdentitySales(shop, current)))
      throw new ConflictException('Shop identity requires review');
    return current;
  }
}
