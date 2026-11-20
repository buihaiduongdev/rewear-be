import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { Cart, CartItem } from '@/modules/cart/entities';
import { CHECKOUT_STATUS } from '@/modules/checkout/constants/checkout.constant';
import { Checkout } from '@/modules/checkout/entities/checkout.entity';
import { CoinService } from '@/modules/coins/core/coin.service';
import {
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import { ORDER_POLICY } from '@/modules/order/constants/order.constant';
import { Order, OrderEvent } from '@/modules/order/entities/order.entity';
import { PAYMENT_ATTEMPT_STATE } from '@/modules/payment/constants/payment.constant';
import { PaymentAttempt } from '@/modules/payment/entities/payment.entity';
import { PaymentPricing } from '@/modules/payment/payment.pricing';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { Shop } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';

import { WalletAccount } from '../entities/wallet.entity';
import { verifiedWalletFunds } from '../verified-wallet-funds';
import { WALLET_HOLD_STATE } from './constants/wallet-checkout.constant';
import {
  WalletCheckoutHold,
  WalletDebit,
} from './entities/wallet-checkout.entity';
import {
  walletCheckoutTotal,
  walletPoolFields,
} from './policies/wallet-checkout.policy';
import { releaseWalletHold } from './release-wallet-hold';
import type { ReserveWalletCheckoutInput } from './schemas/wallet-checkout.schema';

@Injectable()
export class WalletCheckoutService {
  constructor(
    private readonly db: DataSource,
    private readonly pricing: PaymentPricing,
  ) {}
  private async lock(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }
  async reserve(
    buyerId: string,
    checkoutId: string,
    input: ReserveWalletCheckoutInput,
  ) {
    const fingerprint = JSON.stringify({
      checkoutId,
      mode: input.mode,
      expectedTotal: input.expectedTotal,
    });
    const prior = await this.db
      .getRepository(WalletCheckoutHold)
      .findOneBy({ buyerId, requestId: input.requestId });
    if (prior) {
      this.assertReplay(prior, fingerprint);
      return this.findMine(buyerId, prior.id);
    }
    const quote = await this.pricing.quote(buyerId, checkoutId);
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      await this.expireDue(manager, now);
      const previous = await manager.findOneBy(WalletCheckoutHold, {
        buyerId,
        requestId: input.requestId,
      });
      if (previous) {
        this.assertReplay(previous, fingerprint);
        return previous;
      }
      const checkout = await manager.findOneByOrFail(Checkout, {
        id: checkoutId,
        buyerId,
      });
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
      const orders = await this.pricing.snapshot(manager, checkout, quote);
      const amount = walletCheckoutTotal(orders, input.expectedTotal);
      const stockCheckedAt = await this.validateStock(
        manager,
        checkout,
        orders,
      );
      if (!checkout.expiresAt || checkout.expiresAt <= stockCheckedAt)
        throw new ConflictException('Checkout expired during stock validation');
      const funds = await verifiedWalletFunds(manager, buyerId, input.mode);
      if (funds.spendable < amount)
        throw new ConflictException('Insufficient verified wallet funds');
      const account = await manager.findOneByOrFail(WalletAccount, {
        userId: buyerId,
      });
      const [available, held] = walletPoolFields(input.mode);
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
          requestId: input.requestId,
          fingerprint,
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
  private assertReplay(hold: WalletCheckoutHold, fingerprint: string) {
    if (hold.fingerprint !== fingerprint)
      throw new ConflictException(
        'Request ID already used for another wallet payment',
      );
  }
  async findMine(buyerId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      await this.expireDue(manager, now);
      return manager.findOneByOrFail(WalletCheckoutHold, { id, buyerId });
    });
  }
  async release(buyerId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const hold = await manager.findOneByOrFail(WalletCheckoutHold, {
        id,
        buyerId,
      });
      await releaseWalletHold(manager, hold, now, WALLET_HOLD_STATE.RELEASED);
      return hold;
    });
  }
  async confirm(buyerId: string, id: string) {
    const result = await this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const hold = await manager.findOneByOrFail(WalletCheckoutHold, {
        id,
        buyerId,
      });
      if (hold.state === WALLET_HOLD_STATE.CAPTURED) return hold;
      if (hold.state === WALLET_HOLD_STATE.HELD && hold.expiresAt <= now) {
        await releaseWalletHold(manager, hold, now, WALLET_HOLD_STATE.EXPIRED);
        return null;
      }
      if (hold.state !== WALLET_HOLD_STATE.HELD)
        throw new ConflictException('Wallet reservation is no longer active');
      const checkout = await manager.findOneByOrFail(Checkout, {
        id: hold.checkoutId,
        buyerId,
      });
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
      await new CoinService().consumeCheckoutCoins(
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
    const funds = await verifiedWalletFunds(manager, hold.buyerId, hold.mode);
    if (funds.backing < funds.held)
      throw new ConflictException(
        'Wallet hold backing requires reconciliation',
      );
    const account = await manager.findOneByOrFail(WalletAccount, {
      userId: hold.buyerId,
    });
    const [, held] = walletPoolFields(hold.mode);
    if (account[held] < hold.amount)
      throw new ConflictException('Wallet hold requires reconciliation');
    account[held] -= hold.amount;
    await manager.save(account);
    const debit = await manager.save(
      WalletDebit,
      manager.create(WalletDebit, {
        holdId: hold.id,
        requestId: hold.requestId,
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
  private async expireDue(manager: EntityManager, now: Date) {
    const holds = await manager.find(WalletCheckoutHold, {
      where: { state: WALLET_HOLD_STATE.HELD },
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
    for (const id of [...new Set(orders.map((row) => row.shopId))].sort())
      await manager.findOneOrFail(Shop, {
        where: { id, status: ShopStatus.ACTIVE },
        lock: { mode: 'pessimistic_read' },
      });
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }
}
