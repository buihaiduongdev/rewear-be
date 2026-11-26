import { randomUUID } from 'node:crypto';

import { CategoryFactory } from '@/database/factories/category.factory';
import { ProductFactory } from '@/database/factories/product.factory';
import { ShopMemberFactory } from '@/database/factories/shop-member.factory';
import { ShopFactory } from '@/database/factories/shop.factory';
import { UserFactory } from '@/database/factories/user.factory';
import { GhnShipmentClient } from '@/infrastructure/shipping/clients/ghn-shipment.client';
import { Category } from '@/modules/category/entities';
import { CodPolicy } from '@/modules/cod/policies/cod.policy';
import { Order } from '@/modules/order/entities';
import { OrderService } from '@/modules/order/order.service';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { ShipmentService } from '@/modules/shipment/shipment.service';
import { PickupLocation } from '@/modules/shipping/entities/pickup-location.entity';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';
import { WalletService } from '@/modules/wallet/wallet.service';

import { createTestDatabase } from '../support/database';
import type { TestDatabase } from '../support/database';

describe('GHN booking and COD cancellation (PostgreSQL)', () => {
  let database: TestDatabase;
  let orders: OrderService;
  let shipments: ShipmentService;
  let status: string;
  let amount: number;
  let carrierCode: string;
  const client = {
    prepare: jest.fn(),
    create: jest.fn(),
    query: jest.fn(),
    cancel: jest.fn(),
    requestReturn: jest.fn(),
    print: jest.fn(),
  };
  beforeAll(async () => {
    database = await createTestDatabase();
    const db = database.dataSource;

    orders = new OrderService(db, new WalletService(db), new CodPolicy(db));
    shipments = new ShipmentService(
      db,
      orders,
      client as unknown as GhnShipmentClient,
    );
  });
  afterAll(async () => database?.destroy());

  async function fixture() {
    const db = database.dataSource;

    const [buyer, owner] = await db.getRepository(User).save([
      new UserFactory().build({
        role: UserRole.ADMIN,
        password: 'unused',
      }),
      new UserFactory().build({
        role: UserRole.USER,
        password: 'unused',
      }),
    ]);
    const shop = await db.getRepository(Shop).save(new ShopFactory().build());
    await db
      .getRepository(ShopMember)
      .save(
        new ShopMemberFactory().build({ shopId: shop.id, userId: owner.id }),
      );
    const category = await db
      .getRepository(Category)
      .save(new CategoryFactory().build());
    const product = await db.getRepository(Product).save(
      new ProductFactory().build({
        shopId: shop.id,
        categoryId: category.id,
      }),
    );
    await db.getRepository(ProductModeration).save({
      productId: product.id,
      status: ProductModerationStatus.APPROVED,
    });
    const address = {
      recipientName: 'Buyer',
      phone: '0912345678',
      addressLine1: 'Test',
      addressLine2: null,
      countryCode: 'VN',
      provinceId: 202,
      provinceName: 'HCM',
      districtId: 1442,
      districtName: 'District 1',
      wardCode: '20101',
      wardName: 'Ward',
      postalCode: null,
      deliveryInstructions: null,
    };
    const ghnShopId = Math.floor(Math.random() * 900000) + 100000;
    await db.getRepository(PickupLocation).save({
      ghnShopId,
      ghnSyncStatus: 'CONNECTED',
      shopId: shop.id,
      contactName: 'Shop',
      phone: address.phone,
      addressLine1: 'Pickup',
      countryCode: 'VN',
      provinceId: 202,
      provinceName: 'HCM',
      districtId: 1442,
      districtName: 'District 1',
      wardCode: '20101',
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
      shopId: ghnShopId,
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
    client.requestReturn.mockResolvedValue(true);
    return { db, buyer, owner, shop, order, product, ghnShopId };
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

  it('does not unlock booked COD stock until the carrier confirms cancelled', async () => {
    const f = await fixture();
    const booked = await shipments.create(
      f.owner.id,
      f.shop.id,
      f.order.id,
      {},
    );
    await orders.cancelCodPending(f.buyer.id, f.order.id);
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

  it('cancels unbooked preparing COD order immediately before carrier pickup', async () => {
    const f = await fixture();
    await orders.cancelCodPending(f.buyer.id, f.order.id);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('cancelled');
    await expect(
      shipments.create(f.owner.id, f.shop.id, f.order.id, {}),
    ).rejects.toThrow('Order cannot be booked');
  });

  it('escalates a cancellation still unknown after 30 minutes even when every carrier query fails', async () => {
    const f = await fixture();
    const booked = await shipments.create(
      f.owner.id,
      f.shop.id,
      f.order.id,
      {},
    );
    await orders.cancelCodPending(f.buyer.id, f.order.id);
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

  it('requests carrier return after pickup during cancellation and keeps stock locked until return resolution', async () => {
    const f = await fixture();
    const booked = await shipments.create(
      f.owner.id,
      f.shop.id,
      f.order.id,
      {},
    );
    await orders.cancelCodPending(f.buyer.id, f.order.id);
    status = 'picked';
    await due(booked.id);
    await shipments.reconcile(booked.id);
    expect(client.requestReturn).toHaveBeenCalledWith(carrierCode, f.ghnShopId);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('shipping');
    expect(
      (await f.db.getRepository(Product).findOneByOrFail({ id: f.product.id }))
        .status,
    ).toBe(ProductStatus.HELD);
    status = 'returned';
    await due(booked.id);
    await shipments.reconcile(booked.id);
    const returned = await f.db
      .getRepository(Order)
      .findOneByOrFail({ id: f.order.id });
    expect(returned.status).toBe('returns');
    expect(returned.carrierReturnedAt).toBeInstanceOf(Date);
    expect(
      (await f.db.getRepository(Product).findOneByOrFail({ id: f.product.id }))
        .status,
    ).toBe(ProductStatus.HELD);
  });
});
