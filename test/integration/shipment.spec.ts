import { randomUUID } from 'node:crypto';

import { GhnShipmentClient } from '@/infrastructure/shipping/ghn-shipment.client';
import { Category } from '@/modules/category/entities';
import { CodPolicy } from '@/modules/cod/cod.policy';
import { MarketplaceFactory } from '@/modules/database/seeds/factories/marketplace.factory';
import { OrderAccess } from '@/modules/order/order.access';
import { Order } from '@/modules/order/order.entity';
import { OrderService } from '@/modules/order/order.service';
import { Product } from '@/modules/product/entities';
import { ProductStatus } from '@/modules/product/enums';
import { ShipmentCancellationService } from '@/modules/shipment/shipment-cancellation.service';
import { Shipment } from '@/modules/shipment/shipment.entity';
import { ShipmentService } from '@/modules/shipment/shipment.service';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { WalletService } from '@/modules/wallet/wallet.service';

import { createTestDatabase } from '../support/database';
import type { TestDatabase } from '../support/database';

describe('GHN booking and COD cancellation (PostgreSQL)', () => {
  let database: TestDatabase;
  let shipments: ShipmentService;
  let cancellations: ShipmentCancellationService;
  let status: string;
  let amount: number;
  let carrierCode: string;
  const client = {
    prepare: jest.fn(),
    create: jest.fn(),
    query: jest.fn(),
    cancel: jest.fn(),
    print: jest.fn(),
  };
  beforeAll(async () => {
    database = await createTestDatabase();
    const db = database.dataSource;
    const access = new OrderAccess();
    const orders = new OrderService(
      db,
      access,
      new WalletService(db),
      new CodPolicy(db),
    );
    shipments = new ShipmentService(
      db,
      access,
      orders,
      client as unknown as GhnShipmentClient,
    );
    cancellations = new ShipmentCancellationService(db, access, orders);
  });
  afterAll(async () => database?.destroy());

  async function fixture() {
    const db = database.dataSource;
    const factory = new MarketplaceFactory(randomUUID());
    const [buyer, owner] = await db
      .getRepository(User)
      .save([factory.user(0, 'unused'), factory.user(1, 'unused')]);
    const shop = await db.getRepository(Shop).save(factory.shop(0));
    await db
      .getRepository(ShopMember)
      .save(factory.shopMember(0, shop.id, owner.id));
    const category = await db.getRepository(Category).save(factory.category(0));
    const product = await db
      .getRepository(Product)
      .save(factory.product(0, { shopId: shop.id, categoryId: category.id }));
    const address = {
      recipientName: 'Buyer',
      phone: '0912345678',
      addressLine1: 'Test',
      addressLine2: null,
      countryCode: 'VN',
      provinceCode: '79',
      provinceName: 'HCM',
      wardCode: '1',
      wardName: 'Ward',
      postalCode: null,
      deliveryInstructions: null,
    };
    await db.getRepository(PickupLocation).save({
      shopId: shop.id,
      contactName: 'Shop',
      phone: address.phone,
      addressLine1: 'Pickup',
      countryCode: 'VN',
      provinceCode: '79',
      provinceName: 'HCM',
      wardCode: '1',
      wardName: 'Ward',
    });
    const order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      paymentId: null,
      paymentMethod: 'COD',
      buyerId: buyer.id,
      shopId: shop.id,
      shopName: shop.name,
      status: 'preparing',
      subtotal: 200000,
      shippingFee: 30000,
      total: 230000,
      address,
      items: [
        {
          productId: product.id,
          title: 'Jacket',
          price: 200000,
          revision: 1,
          size: null,
          condition: 'GOOD',
          coverUrl: null,
          shippingPackage: {
            weightGrams: 500,
            lengthCm: 30,
            widthCm: 20,
            heightCm: 5,
          },
        },
      ],
      sellerConfirmBy: new Date(Date.now() + 86400000),
      acceptedAt: new Date(),
      handoverBy: new Date(Date.now() + 48 * 3600000),
    });
    await db.getRepository(Product).update(product.id, {
      status: ProductStatus.HELD,
      reservedOrderId: order.id,
    });
    status = 'ready_to_pick';
    amount = 230000;
    carrierCode = `GHN${randomUUID().slice(0, 8)}`;
    client.prepare.mockImplementation(
      async (_input: unknown, codAmount: number, clientCode: string) => ({
        cod_amount: codAmount,
        client_order_code: clientCode,
        payment_type_id: 1,
      }),
    );
    client.create.mockImplementation(async () => ({
      orderCode: carrierCode,
      fee: 32000,
      estimatedDeliveryAt: null,
    }));
    client.query.mockImplementation(async (id: string) => ({
      clientCode: id,
      orderCode: carrierCode,
      shopId: 123,
      status,
      updatedAt: new Date().toISOString(),
      codAmount: amount,
      paymentType: 1,
      codCollected: false,
      codTransferred: false,
      collectedAt: null,
      transferredAt: null,
    }));
    client.cancel.mockResolvedValue(true);
    return { db, buyer, owner, shop, order, product };
  }
  async function due(id: string) {
    await database.dataSource
      .getRepository(Shipment)
      .update(id, { nextQueryAt: new Date(0) });
  }

  it('books once and only verified pickup/delivery moves order; delivery does not prove COD collection', async () => {
    const f = await fixture();
    const booked = await shipments.create(
      f.owner.id,
      f.shop.id,
      f.order.id,
      {},
    );
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('preparing');
    expect(
      (await shipments.create(f.owner.id, f.shop.id, f.order.id, {})).id,
    ).toBe(booked.id);
    status = 'picked';
    await due(booked.id);
    await shipments.reconcile(booked.id);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('shipping');
    status = 'delivered';
    await due(booked.id);
    await shipments.reconcile(booked.id);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('delivered');
    expect(
      (await f.db.getRepository(Shipment).findOneByOrFail({ id: booked.id }))
        .codCollectedAt,
    ).toBeNull();
    expect(
      (await f.db.getRepository(Product).findOneByOrFail({ id: f.product.id }))
        .status,
    ).toBe(ProductStatus.SOLD);
    status = 'ready_to_pick';
    await due(booked.id);
    await shipments.reconcile(booked.id);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('delivered');
  });

  it('persists timeout as unknown, recovers by original reference and never creates another waybill', async () => {
    const f = await fixture();
    client.create.mockRejectedValue(new Error('timeout'));
    const unknown = await shipments.create(
      f.owner.id,
      f.shop.id,
      f.order.id,
      {},
    );
    expect(unknown.state).toBe('UNKNOWN');
    client.create.mockImplementation(async () => {
      throw new Error('must not create again');
    });
    expect(
      (await shipments.create(f.owner.id, f.shop.id, f.order.id, {})).id,
    ).toBe(unknown.id);
    await due(unknown.id);
    await shipments.reconcile(unknown.id);
    expect(
      (await f.db.getRepository(Shipment).findOneByOrFail({ id: unknown.id }))
        .state,
    ).toBe('BOOKED');
  });

  it('refuses mismatched carrier money and keeps stock locked for reconciliation', async () => {
    const f = await fixture();
    const booked = await shipments.create(
      f.owner.id,
      f.shop.id,
      f.order.id,
      {},
    );
    amount = 999;
    status = 'delivered';
    await due(booked.id);
    await shipments.reconcile(booked.id);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('preparing');
    expect(
      (await f.db.getRepository(Shipment).findOneByOrFail({ id: booked.id }))
        .reviewReason,
    ).toBe('CARRIER_DATA_MISMATCH');
  });

  it('does not unlock on cancellation acknowledgement until the carrier confirms cancelled', async () => {
    const f = await fixture();
    const booked = await shipments.create(
      f.owner.id,
      f.shop.id,
      f.order.id,
      {},
    );
    await cancellations.request(f.buyer.id, f.order.id);
    await cancellations.respond(f.owner.id, f.shop.id, f.order.id, {
      approve: true,
      reason: 'Buyer changed their mind',
      evidence: 'Buyer request',
    });
    await due(booked.id);
    await shipments.reconcile(booked.id);
    expect(
      (await f.db.getRepository(Product).findOneByOrFail({ id: f.product.id }))
        .status,
    ).toBe(ProductStatus.HELD);
    status = 'cancel';
    await due(booked.id);
    await shipments.reconcile(booked.id);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('cancelled');
    expect(
      (await f.db.getRepository(Product).findOneByOrFail({ id: f.product.id }))
        .status,
    ).toBe(ProductStatus.ACTIVE);
    expect((await new WalletService(f.db).mine(f.buyer.id, {})).balance).toBe(
      0,
    );
  });

  it('blocks booking during cancellation and auto-approves after 12 hours without a waybill', async () => {
    const f = await fixture();
    await cancellations.request(f.buyer.id, f.order.id);
    await expect(
      shipments.create(f.owner.id, f.shop.id, f.order.id, {}),
    ).rejects.toThrow('Order cannot be booked');
    await f.db
      .getRepository(Order)
      .update(f.order.id, { cancelRespondBy: new Date(Date.now() - 1) });
    await cancellations.run();
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('cancelled');
  });

  it('escalates a cancellation still unknown after 30 minutes even when every carrier query fails', async () => {
    const f = await fixture();
    const booked = await shipments.create(
      f.owner.id,
      f.shop.id,
      f.order.id,
      {},
    );
    await cancellations.request(f.buyer.id, f.order.id);
    await cancellations.respond(f.owner.id, f.shop.id, f.order.id, {
      approve: true,
      reason: 'Cannot continue',
      evidence: 'Buyer request',
    });
    await f.db.getRepository(Shipment).update(booked.id, {
      cancelRequestedAt: new Date(Date.now() - 31 * 60000),
      nextQueryAt: new Date(0),
    });
    client.query.mockRejectedValue(new Error('carrier unavailable'));
    await shipments.run();
    const row = await f.db
      .getRepository(Shipment)
      .findOneByOrFail({ id: booked.id });
    expect(row.reviewReason).toBe('CANCELLATION_UNRESOLVED_30_MINUTES');
    expect(row.state).toBe('CANCEL_PENDING');
    expect(
      (await f.db.getRepository(Product).findOneByOrFail({ id: f.product.id }))
        .status,
    ).toBe(ProductStatus.HELD);
  });
});
