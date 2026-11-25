import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { DataSource, EntityManager, In, LessThanOrEqual } from 'typeorm';

import { MONEY_CURRENCY } from '@/common/constants/money.constant';
import { resolveShippingPackage } from '@/common/schemas/shipping-package.schema';
import { CartService } from '@/modules/cart';
import { Cart, CartItem } from '@/modules/cart/entities';
import { CartAvailability } from '@/modules/cart/enums/cart-availability.enum';
import { Category } from '@/modules/category/entities';
import {
  CHECKOUT_HOLD_SECONDS,
  CHECKOUT_REMOVAL_REASON,
  CHECKOUT_STATUS,
} from '@/modules/checkout/constants/checkout.constant';
import { allocateCoins } from '@/modules/coins/checkout/coin-allocation';
import { CoinService } from '@/modules/coins/core/coin.service';
import { PAYMENT_ATTEMPT_STATE } from '@/modules/payment/constants/payment.constant';
import { PaymentAttempt } from '@/modules/payment/entities';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { Shop } from '@/modules/shop/entities';
import { UserAddress } from '@/modules/user-address/entities';
import { User } from '@/modules/user/entities';
import { WalletCheckoutHold } from '@/modules/wallet/checkout/entities';
import { releaseWalletHold } from '@/modules/wallet/checkout/wallet-checkout.service';
import { WALLET_HOLD_STATE } from '@/modules/wallet/constants/wallet.constant';

import { CheckoutOrder } from './entities/checkout-order.entity';
import { Checkout } from './entities/checkout.entity';
import { pruneIdentityCheckout } from './identity-checkout.policy';
import type {
  CheckoutAddress,
  CreateCheckoutInput,
  SelectCheckoutCoinsInput,
} from './schemas/checkout.schema';

const EXPIRE_BATCH_SIZE = 100;

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private running = false;

  constructor(
    private readonly db: DataSource,
    private readonly cartService: CartService,
  ) {}

  @Interval(30_000)
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.expire();
    } catch {
      this.logger.error('Checkout expiry scan failed; retry required');
    } finally {
      this.running = false;
    }
  }

  async create(buyerId: string, input: CreateCheckoutInput) {
    return this.db.transaction(async (manager) => {
      await manager.findOne(User, {
        where: { id: buyerId },
        lock: { mode: 'pessimistic_write' },
      });
      const productIds = [...input.productIds].sort();
      await this.expireBuyerAndProducts(manager, buyerId, productIds);
      const previous = await manager.findOneBy(Checkout, {
        buyerId,
        requestId: input.requestId,
      });
      if (previous) {
        const replaySelectionHasChanged =
          previous.addressId !== input.addressId ||
          JSON.stringify(previous.requestedProductIds) !==
            JSON.stringify(productIds);
        if (replaySelectionHasChanged) {
          throw new ConflictException(
            'Request ID was already used with a different selection or address',
          );
        }
        return this.view(manager, previous);
      }
      const snapshot = await this.snapshotAddress(
        manager,
        buyerId,
        input.addressId,
      );
      const products = await manager.find(Product, {
        where: { id: In(productIds) },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      await this.lockProductEligibility(manager, products);
      const cartView = await this.cartService.findMine(buyerId, manager);
      const checkout = manager.create(Checkout, {
        buyerId,
        requestId: input.requestId,
        addressId: input.addressId,
        requestedProductIds: productIds,
        address: snapshot,
        status: CHECKOUT_STATUS.EMPTY,
        expiresAt: null,
        holdSeconds: CHECKOUT_HOLD_SECONDS,
        removedItems: [],
      });
      const groups = this.buildOrderGroups(
        manager,
        checkout,
        products,
        cartView,
        snapshot,
      );
      if (groups.size) {
        checkout.status = CHECKOUT_STATUS.HELD;
        const [{ now }] = await manager.query(
          'SELECT clock_timestamp() AS now',
        );
        checkout.expiresAt = new Date(
          new Date(now).getTime() + checkout.holdSeconds * 1000,
        );
      }
      await manager.save(checkout);
      const orderList = Array.from(groups.values());
      for (const order of orderList) {
        order.checkoutId = checkout.id;
      }
      if (orderList.length > 0) {
        await manager.save(orderList);
        const allProductIds = orderList.flatMap((o) =>
          o.items.map((i) => i.productId),
        );
        if (allProductIds.length > 0) {
          await manager.update(
            Product,
            {
              id: In(allProductIds),
              status: ProductStatus.ACTIVE,
            },
            {
              status: ProductStatus.HELD,
              reservationId: checkout.id,
              heldUntil: checkout.expiresAt,
            },
          );
        }
      }
      const cart = await manager.findOneBy(Cart, { userId: buyerId });
      if (cart && checkout.removedItems.length) {
        await manager.delete(CartItem, {
          cartId: cart.id,
          productId: In(checkout.removedItems.map((i) => i.productId)),
        });
      }
      return this.view(manager, checkout);
    });
  }

  private async lockProductEligibility(
    manager: EntityManager,
    products: Product[],
  ) {
    for (const id of [
      ...new Set(
        products.map((p) => p.categoryId).filter((id): id is string => !!id),
      ),
    ].sort()) {
      await manager.findOne(Category, {
        where: { id },
        lock: { mode: 'pessimistic_read' },
      });
    }
    for (const id of [
      ...new Set(
        products.map((p) => p.shopId).filter((id): id is string => !!id),
      ),
    ].sort()) {
      await manager.findOne(Shop, {
        where: { id },
        lock: { mode: 'pessimistic_read' },
      });
    }
  }

  private buildOrderGroups(
    manager: EntityManager,
    checkout: Checkout,
    products: Product[],
    cartView: Awaited<ReturnType<CartService['findMine']>>,
    snapshot: CheckoutAddress,
  ) {
    const saved = new Map(
      cartView.groups.flatMap((g) =>
        g.items.map(
          (item) => [item.productId, { item, shop: g.shop }] as const,
        ),
      ),
    );
    const groups = new Map<string, CheckoutOrder>();
    for (const productId of checkout.requestedProductIds) {
      const cartEntry = saved.get(productId);
      const product = cartEntry?.item.product;
      const cartEntryIsUnavailable =
        !cartEntry ||
        cartEntry.item.availability !== CartAvailability.AVAILABLE ||
        !product ||
        !cartEntry.shop;
      if (cartEntryIsUnavailable) {
        checkout.removedItems.push({
          productId,
          reason:
            cartEntry?.item.availability ?? CHECKOUT_REMOVAL_REASON.NOT_IN_CART,
        });
        continue;
      }
      const row = products.find((p) => p.id === productId)!;
      if (row.reservationId)
        throw new ConflictException('Product reservation is inconsistent');
      let order = groups.get(cartEntry.shop.id);
      if (!order) {
        order = manager.create(CheckoutOrder, {
          shopId: cartEntry.shop.id,
          address: snapshot,
          items: [],
          subtotal: 0,
          shippingFee: null,
        });
        groups.set(cartEntry.shop.id, order);
      }
      order.items.push({
        shippingPackage: row.shippingPackage
          ? resolveShippingPackage(row.shippingPackage)
          : null,
        productId,
        title: product.title,
        price: product.price,
        size: product.size,
        condition: product.condition,
        coverUrl: product.coverUrl,
      });
      order.subtotal += product.price;
    }
    return groups;
  }

  private async snapshotAddress(
    manager: EntityManager,
    buyerId: string,
    addressId: string,
  ): Promise<CheckoutAddress> {
    const address = await manager.findOneOrFail(UserAddress, {
      where: { id: addressId, userId: buyerId },
      lock: { mode: 'pessimistic_read' },
    });
    return {
      recipientName: address.recipientName,
      phone: address.phone,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      countryCode: address.countryCode,
      provinceId: address.provinceId,
      provinceName: address.provinceName,
      districtId: address.districtId,
      districtName: address.districtName,
      wardCode: address.wardCode,
      wardName: address.wardName,
      postalCode: address.postalCode,
      deliveryInstructions: address.deliveryInstructions,
    };
  }

  async selectCoins(
    buyerId: string,
    id: string,
    input: SelectCheckoutCoinsInput,
  ) {
    return this.db.transaction(async (manager) => {
      await manager.findOne(User, {
        where: { id: buyerId },
        lock: { mode: 'pessimistic_write' },
      });
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      const checkout =
        typeof manager.findOneOrFail === 'function'
          ? await manager.findOneOrFail(Checkout, {
              where: { id, buyerId },
              lock: { mode: 'pessimistic_write' },
            })
          : await manager.findOneByOrFail(Checkout, { id, buyerId });
      if (
        checkout.status === CHECKOUT_STATUS.HELD &&
        checkout.expiresAt &&
        checkout.expiresAt <= now
      ) {
        await this.release(manager, checkout, CHECKOUT_STATUS.EXPIRED);
      }
      if (
        checkout.status !== CHECKOUT_STATUS.HELD ||
        !checkout.expiresAt ||
        checkout.expiresAt <= now
      )
        throw new ConflictException('An active checkout is required');
      const attempts = await manager.find(PaymentAttempt, {
        where: { checkoutId: id },
      });
      if (
        attempts.some(
          (row) =>
            row.state !== PAYMENT_ATTEMPT_STATE.FAILED &&
            row.state !== PAYMENT_ATTEMPT_STATE.REFUNDED,
        ) ||
        (await manager.existsBy(WalletCheckoutHold, {
          checkoutId: id,
          state: WALLET_HOLD_STATE.HELD,
        }))
      )
        throw new ConflictException(
          'Resolve payment reservations before changing coins',
        );
      const orders = await manager.find(CheckoutOrder, {
        where: { checkoutId: id },
      });
      await new CoinService().reserveCheckoutCoins(
        manager,
        {
          ...checkout,
          subtotal: orders.reduce((sum, row) => sum + row.subtotal, 0),
        },
        input.amount,
        input.mode,
        input.requestId,
        now,
      );
      checkout.coinDiscount = input.amount;
      checkout.coinMode = input.amount ? input.mode : null;
      await manager.save(checkout);
      return this.view(manager, checkout);
    });
  }

  async findMine(buyerId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const checkout = await manager.findOneOrFail(Checkout, {
        where: { id, buyerId },
        lock: { mode: 'pessimistic_write' },
      });
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      if (
        checkout.status === CHECKOUT_STATUS.HELD &&
        checkout.expiresAt &&
        checkout.expiresAt <= now
      ) {
        await this.release(manager, checkout, CHECKOUT_STATUS.EXPIRED);
      } else {
        await pruneIdentityCheckout(manager, checkout, now);
      }
      return this.view(manager, checkout);
    });
  }

  async cancel(buyerId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const checkout = await manager.findOneOrFail(Checkout, {
        where: { id, buyerId },
        lock: { mode: 'pessimistic_write' },
      });
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      if (checkout.status === CHECKOUT_STATUS.HELD)
        await this.release(
          manager,
          checkout,
          checkout.expiresAt && checkout.expiresAt <= now
            ? CHECKOUT_STATUS.EXPIRED
            : CHECKOUT_STATUS.CANCELLED,
        );
      return this.view(manager, checkout);
    });
  }

  async expire() {
    const [{ now }] = await this.db.query('SELECT clock_timestamp() AS now');
    const due = await this.db.getRepository(Checkout).find({
      select: { id: true },
      where: {
        status: CHECKOUT_STATUS.HELD,
        expiresAt: LessThanOrEqual(new Date(now)),
      },
      order: { expiresAt: 'ASC', id: 'ASC' },
      take: EXPIRE_BATCH_SIZE,
    });
    for (const item of due) {
      try {
        await this.db.transaction(async (manager) => {
          const checkout = await manager.findOne(Checkout, {
            where: { id: item.id },
            lock: { mode: 'pessimistic_write' },
          });
          const [{ now: current }] = await manager.query(
            'SELECT clock_timestamp() AS now',
          );
          if (
            checkout?.status === CHECKOUT_STATUS.HELD &&
            checkout.expiresAt &&
            checkout.expiresAt <= new Date(current)
          ) {
            await this.release(manager, checkout, CHECKOUT_STATUS.EXPIRED);
          }
        });
      } catch {
        this.logger.warn({
          checkoutId: item.id,
          message: 'Checkout expiry rolled back; retry on next scan',
        });
      }
    }
  }

  private async expireBuyerAndProducts(
    manager: EntityManager,
    buyerId: string,
    productIds: string[],
  ) {
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    const expired = await manager
      .createQueryBuilder(Checkout, 'checkout')
      .where('checkout.status = :status AND checkout.expiresAt <= :now', {
        status: CHECKOUT_STATUS.HELD,
        now: new Date(now),
      })
      .andWhere(
        productIds.length > 0
          ? '(checkout.buyerId = :buyerId OR EXISTS (SELECT 1 FROM products p WHERE p."reservationId" = checkout.id AND p.id IN (:...productIds)))'
          : 'checkout.buyerId = :buyerId',
        { buyerId, productIds },
      )
      .orderBy('checkout.id', 'ASC')
      .setLock('pessimistic_write')
      .getMany();
    for (const checkout of expired)
      await this.release(manager, checkout, CHECKOUT_STATUS.EXPIRED);
  }

  private async release(
    manager: EntityManager,
    checkout: Checkout,
    status: typeof CHECKOUT_STATUS.EXPIRED | typeof CHECKOUT_STATUS.CANCELLED,
  ) {
    await manager.update(
      Product,
      { reservationId: checkout.id, status: ProductStatus.HELD },
      { status: ProductStatus.ACTIVE, heldUntil: null, reservationId: null },
    );
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    const holds = await manager.find(WalletCheckoutHold, {
      where: { checkoutId: checkout.id, state: WALLET_HOLD_STATE.HELD },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    for (const hold of holds)
      await releaseWalletHold(
        manager,
        hold,
        new Date(now),
        status === CHECKOUT_STATUS.EXPIRED
          ? WALLET_HOLD_STATE.EXPIRED
          : WALLET_HOLD_STATE.RELEASED,
      );
    await new CoinService().releaseCheckoutCoins(
      manager,
      checkout.id,
      new Date(now),
    );
    checkout.status = status;
    await manager.save(checkout);
  }

  private async view(manager: EntityManager, checkout: Checkout) {
    const orders = await manager.find(CheckoutOrder, {
      where: { checkoutId: checkout.id },
      relations: { shop: true },
      order: { id: 'ASC' },
    });
    const allocation = allocateCoins(
      orders.map((order) => ({ id: order.id, amount: order.subtotal })),
      checkout.coinDiscount ?? 0,
    );
    return {
      ...checkout,
      orders: orders.map((order) => {
        const coinDiscount = allocation.get(order.id) ?? 0;
        const items = allocateCoins(
          order.items.map((item) => ({
            id: item.productId,
            amount: item.price,
          })),
          coinDiscount,
          false,
        );
        return {
          ...order,
          coinDiscount,
          items: order.items.map((item) => ({
            ...item,
            coinDiscount: items.get(item.productId) ?? 0,
          })),
          shopName: order.shop.name,
        };
      }),
      subtotal: orders.reduce((total, order) => total + order.subtotal, 0),
      currency: MONEY_CURRENCY.VND,
      paymentReady: false as const,
    };
  }
}
