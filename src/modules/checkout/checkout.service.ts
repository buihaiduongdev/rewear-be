import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { DataSource, EntityManager, In, LessThanOrEqual } from 'typeorm';

import { resolveShippingPackage } from '@/common/schemas/shipping-package.schema';
import { CartService } from '@/modules/cart';
import { Cart, CartItem } from '@/modules/cart/entities';
import { Category } from '@/modules/category/entities';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { Shop } from '@/modules/shop/entities';
import { UserAddress } from '@/modules/user-address/entities';
import { User } from '@/modules/user/entities';

import { Checkout, CheckoutOrder } from './entities/checkout.entity';
import type { CheckoutAddress } from './entities/checkout.entity';
import type { CreateCheckoutInput } from './schemas/checkout.schema';

@Injectable()
export class CheckoutService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly db: DataSource,
    private readonly cart: CartService,
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
        if (
          previous.addressId !== input.addressId ||
          JSON.stringify(previous.requestedProductIds) !==
            JSON.stringify(productIds)
        ) {
          throw new ConflictException(
            'Request ID was already used with a different selection or address',
          );
        }
        return this.view(manager, previous);
      }
      const address = await manager.findOne(UserAddress, {
        where: { id: input.addressId, userId: buyerId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!address) throw new NotFoundException('Delivery address not found');
      const snapshot: CheckoutAddress = {
        recipientName: address.recipientName,
        phone: address.phone,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        countryCode: address.countryCode,
        provinceCode: address.provinceCode,
        provinceName: address.provinceName,
        wardCode: address.wardCode,
        wardName: address.wardName,
        postalCode: address.postalCode,
        deliveryInstructions: address.deliveryInstructions,
      };
      const products = await manager.find(Product, {
        where: { id: In(productIds) },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      // Keep source/category eligibility stable while taking the approved snapshot.
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
      for (const id of [
        ...new Set(
          products
            .map((p) => p.sellerUserId)
            .filter((id): id is string => !!id),
        ),
      ].sort()) {
        await manager.findOne(User, {
          where: { id },
          lock: { mode: 'pessimistic_read' },
        });
      }
      const cartView = await this.cart.readCart(manager, buyerId);
      const saved = new Map(
        cartView.groups.flatMap((g) =>
          g.items.map(
            (item) => [item.productId, { item, source: g.source }] as const,
          ),
        ),
      );
      const checkout = manager.create(Checkout, {
        buyerId,
        requestId: input.requestId,
        addressId: input.addressId,
        requestedProductIds: productIds,
        address: snapshot,
        status: 'EMPTY',
        expiresAt: null,
        holdSeconds: 600,
        removedItems: [],
      });
      const groups = new Map<string, CheckoutOrder>();
      for (const productId of productIds) {
        const entry = saved.get(productId);
        if (
          !entry ||
          entry.item.availability !== 'AVAILABLE' ||
          !entry.item.product ||
          !entry.source
        ) {
          checkout.removedItems.push({
            productId,
            reason: entry?.item.availability ?? 'NOT_IN_CART',
          });
          continue;
        }
        const source = entry.source;
        const product = entry.item.product;
        const row = products.find((p) => p.id === productId)!;
        // Eligibility and held-state check occurred after acquiring the product write lock.
        if (row.reservationId)
          throw new ConflictException('Product reservation is inconsistent');
        const key = `${source.type}:${source.id}`;
        let order = groups.get(key);
        if (!order) {
          order = manager.create(CheckoutOrder, {
            sourceType: source.type,
            sourceId: source.id,
            sourceName: source.name,
            address: snapshot,
            items: [],
            subtotal: 0,
            shippingFee: null,
          });
          groups.set(key, order);
        }
        order.items.push({
          shippingPackage: row.shippingPackage
            ? resolveShippingPackage(row.shippingPackage)
            : null,
          productId,
          title: product.title,
          price: product.price,
          revision: row.revision,
          size: product.size,
          condition: product.condition,
          coverUrl: product.coverUrl,
        });
        order.subtotal += product.price;
      }
      if (groups.size) {
        checkout.status = 'HELD';
        const [{ now }] = await manager.query(
          'SELECT clock_timestamp() AS now',
        );
        checkout.expiresAt = new Date(
          new Date(now).getTime() + checkout.holdSeconds * 1000,
        );
      }
      await manager.save(checkout);
      for (const order of groups.values()) {
        order.checkoutId = checkout.id;
        await manager.save(order);
        await manager.update(
          Product,
          {
            id: In(order.items.map((i) => i.productId)),
            status: ProductStatus.ACTIVE,
          },
          {
            status: ProductStatus.HELD,
            reservationId: checkout.id,
            heldUntil: checkout.expiresAt,
          },
        );
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

  async findMine(buyerId: string, id: string) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      await this.expireDue(manager);
      const checkout = await manager.findOneBy(Checkout, { id, buyerId });
      if (!checkout) throw new NotFoundException('Checkout not found');
      return this.view(manager, checkout);
    });
  }

  async cancel(buyerId: string, id: string) {
    return this.db.transaction(async (manager) => {
      await this.lock(manager);
      await this.expireDue(manager);
      const checkout = await manager.findOneBy(Checkout, { id, buyerId });
      if (!checkout) throw new NotFoundException('Checkout not found');
      if (checkout.status === 'HELD')
        await this.release(manager, checkout, 'CANCELLED');
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
      where: { status: 'HELD', expiresAt: LessThanOrEqual(new Date(now)) },
      order: { id: 'ASC' },
    });
    for (const checkout of expired)
      await this.release(manager, checkout, 'EXPIRED');
  }

  private async release(
    manager: EntityManager,
    checkout: Checkout,
    status: 'EXPIRED' | 'CANCELLED',
  ) {
    await manager.update(
      Product,
      { reservationId: checkout.id, status: ProductStatus.HELD },
      { status: ProductStatus.ACTIVE, heldUntil: null, reservationId: null },
    );
    checkout.status = status;
    await manager.save(checkout);
  }

  private async view(manager: EntityManager, checkout: Checkout) {
    const orders = await manager.find(CheckoutOrder, {
      where: { checkoutId: checkout.id },
      order: { id: 'ASC' },
    });
    return {
      ...checkout,
      orders,
      subtotal: orders.reduce((total, order) => total + order.subtotal, 0),
      currency: 'VND' as const,
      paymentReady: false as const,
    };
  }
}
