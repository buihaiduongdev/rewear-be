import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

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
import { snapshotFeeDisclosure } from '@/modules/fees/disclosure/fee-disclosure';
import { PAYMENT_ATTEMPT_STATE } from '@/modules/payment/constants/payment.constant';
import { PaymentAttempt } from '@/modules/payment/entities/payment.entity';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { Shop } from '@/modules/shop/entities';
import { UserAddress } from '@/modules/user-address/entities';
import { WALLET_HOLD_STATE } from '@/modules/wallet/checkout/constants/wallet-checkout.constant';
import { WalletCheckoutHold } from '@/modules/wallet/checkout/entities/wallet-checkout.entity';
import { releaseWalletHold } from '@/modules/wallet/checkout/release-wallet-hold';

import { CheckoutOrder } from './entities/checkout-order.entity';
import { Checkout } from './entities/checkout.entity';
import type { SelectCheckoutCoinsInput } from './schemas/checkout.schema';
import type { CreateCheckoutInput } from './types/checkout.type';
import type { CheckoutAddress } from './types/checkout.type';

@Injectable()
export class CheckoutService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly db: DataSource,
    private readonly cartService: CartService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.expire()
        .catch((error: unknown) =>
          this.logger.error(
            'Checkout expiry failed',
            error instanceof Error ? error.stack : undefined,
          ),
        )
        .finally(() => {
          this.running = false;
        });
    }, 30_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // A short transaction-wide advisory lock serializes reservation lifecycle writes.
  // It is shared across app processes; no transaction stays open during the hold.
  private async lock(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
  }

  async create(buyerId: string, input: CreateCheckoutInput) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      await this.expireDue(manager);
      const productIds = [...input.productIds].sort();
      const previous = await manager.findOneBy(Checkout, {
        buyerId,
        requestId: input.requestId,
      });
      if (previous) {
        const replaySelectionHasChanged =
          previous.addressId !== input.addressId ||
          (previous.feeDisclosure?.buyerAcceptedAt
            ? previous.feeDisclosure.policyId
            : undefined) !== input.feePolicyId ||
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
      const cartView = await this.cartService.readCart(manager, buyerId);

      const [{ disclosureNow }] = await manager.query(
        'SELECT clock_timestamp() AS "disclosureNow"',
      );
      const feeDisclosure = await snapshotFeeDisclosure(
        manager,
        input,
        [...new Set(products.map((product) => product.shopId))],
        new Date(disclosureNow),
      );
      const checkout = manager.create(Checkout, {
        feeDisclosure,
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
    // Keep shop/category eligibility stable while taking the approved snapshot.
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
    cartView: Awaited<ReturnType<CartService['readCart']>>,
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
      // Eligibility and held-state check occurred after acquiring the product write lock.
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
    const snapshot: CheckoutAddress = {
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
    return snapshot;
  }

  async selectCoins(
    buyerId: string,
    id: string,
    input: SelectCheckoutCoinsInput,
  ) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      await this.expireDue(manager);
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      const checkout = await manager.findOneByOrFail(Checkout, { id, buyerId });
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
      await this.lock(manager);
      await this.expireDue(manager);
      const checkout = await manager.findOneByOrFail(Checkout, { id, buyerId });
      return this.view(manager, checkout);
    });
  }

  async cancel(buyerId: string, id: string) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      await this.expireDue(manager);
      const checkout = await manager.findOneByOrFail(Checkout, { id, buyerId });
      if (checkout.status === CHECKOUT_STATUS.HELD)
        await this.release(manager, checkout, CHECKOUT_STATUS.CANCELLED);
      return this.view(manager, checkout);
    });
  }

  async expire() {
    await this.db.transaction(async (manager) => {
      await this.lock(manager);
      await this.expireDue(manager);
    });
  }

  private async expireDue(manager: EntityManager) {
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    const expired = await manager.find(Checkout, {
      where: {
        status: CHECKOUT_STATUS.HELD,
        expiresAt: LessThanOrEqual(new Date(now)),
      },
      order: { id: 'ASC' },
    });
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
