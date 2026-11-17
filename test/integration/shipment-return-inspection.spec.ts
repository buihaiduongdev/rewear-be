import { randomUUID } from 'node:crypto';

import { CategoryFactory } from '@/database/factories/category.factory';
import { ProductFactory } from '@/database/factories/product.factory';
import { ShopMemberFactory } from '@/database/factories/shop-member.factory';
import { ShopFactory } from '@/database/factories/shop.factory';
import { UserFactory } from '@/database/factories/user.factory';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { Category } from '@/modules/category/entities';
import {
  CodBuyerCancellation,
  CodRestriction,
} from '@/modules/cod/entities/cod.entity';
import { CodPolicy } from '@/modules/cod/policies/cod.policy';
import { Order } from '@/modules/order/entities/order.entity';
import { OrderService } from '@/modules/order/order.service';
import { Product, ProductModeration } from '@/modules/product/entities';
import {
  ProductModerationStatus,
  ProductStatus,
} from '@/modules/product/enums';
import { ShipmentReturnInspection } from '@/modules/shipment/entities/shipment-return-inspection.entity';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { returnInspectionSchema } from '@/modules/shipment/schemas/return-inspection.schema';
import { ShipmentReturnInspectionService } from '@/modules/shipment/shipment-return-inspection.service';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopStatus } from '@/modules/shop/enums';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';
import { WalletCredit } from '@/modules/wallet/entities/wallet.entity';
import { WalletService } from '@/modules/wallet/wallet.service';

import { createTestDatabase, type TestDatabase } from '../support/database';

describe('returned COD stock inspection (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: ShipmentReturnInspectionService;
  beforeAll(async () => {
    database = await createTestDatabase();
    const db = database.dataSource;

    service = new ShipmentReturnInspectionService(
      db,
      new OrderService(db, new WalletService(db), new CodPolicy(db)),
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
    const member = await db
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
      version: 1,
      reason: null,
    });
    const order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      paymentMethod: 'COD',
      paymentId: null,
      buyerId: buyer.id,
      shopId: shop.id,
      shopName: shop.name,
      status: 'returns',
      subtotal: 200000,
      shippingFee: 30000,
      total: 230000,
      address: {
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
      },
      items: [
        {
          productId: product.id,
          title: 'Jacket',
          price: 200000,
          size: null,
          condition: 'GOOD',
          coverUrl: null,
          shippingPackage: null,
        },
      ],
      sellerConfirmBy: new Date(),
      carrierReturnedAt: new Date(),
    });
    await db.getRepository(Product).update(product.id, {
      status: ProductStatus.HELD,
      reservedOrderId: order.id,
    });
    const shipment = await db.getRepository(Shipment).save({
      orderId: order.id,
      state: 'BOOKED',
      orderCode: randomUUID(),
      payload: {},
      input: {} as Shipment['input'],
      quotedParcel: {
        weightGrams: 500,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 5,
      },
      codAmount: 230000,
      providerStatus: 'returned',
      pickedObservedAt: new Date(),
      nextQueryAt: null,
    });
    return {
      db,
      buyer,
      owner,
      shop,
      member,
      category,
      product,
      order,
      shipment,
    };
  }
  const input = {
    condition: 'SELLABLE' as const,
    reason: 'Checked returned parcel',
    evidence: 'inspection-photo',
  };
  it('validates a strict inspection with required reason and evidence', () => {
    expect(returnInspectionSchema.safeParse(input).success).toBe(true);
    for (const invalid of [
      { ...input, condition: 'UNKNOWN' },
      { ...input, reason: ' ' },
      { ...input, evidence: '' },
      { ...input, admin: true },
    ])
      expect(returnInspectionSchema.safeParse(invalid).success).toBe(false);
  });
  it('reopens inspected stock once without any wallet credit or buyer strike', async () => {
    const f = await fixture();
    const [first, replay] = await Promise.all([
      service.inspect(f.owner.id, f.shop.id, f.order.id, input),
      service.inspect(f.owner.id, f.shop.id, f.order.id, input),
    ]);
    expect(first.inspection?.id).toBe(replay.inspection?.id);
    expect(
      await f.db
        .getRepository(ShipmentReturnInspection)
        .countBy({ orderId: f.order.id }),
    ).toBe(1);
    const product = await f.db
      .getRepository(Product)
      .findOneByOrFail({ id: f.product.id });
    expect(product.status).toBe(ProductStatus.ACTIVE);
    expect(product.reservedOrderId).toBeNull();
    const order = await f.db
      .getRepository(Order)
      .findOneByOrFail({ id: f.order.id });
    expect(order.status).toBe('cancelled');
    expect(order.cancelState).toBe('CLOSED');
    expect(
      await f.db.getRepository(WalletCredit).countBy({ orderId: f.order.id }),
    ).toBe(0);
    const audit = await f.db
      .getRepository(ShipmentReturnInspection)
      .findOneByOrFail({ orderId: f.order.id });
    expect(
      await f.db
        .getRepository(CodBuyerCancellation)
        .countBy({ buyerId: f.buyer.id }),
    ).toBe(0);
    expect(
      await f.db.getRepository(CodRestriction).countBy({ buyerId: f.buyer.id }),
    ).toBe(0);
    expect(audit.actorId).toBe(f.owner.id);
    expect(audit.evidence).toBe(input.evidence);
    await expect(
      service.inspect(f.owner.id, f.shop.id, f.order.id, {
        ...input,
        condition: 'DAMAGED',
      }),
    ).rejects.toThrow('already inspected');
  });
  it('hides damaged stock and never releases stock owned by another order', async () => {
    for (const other of [false, true]) {
      const f = await fixture();
      const otherId = randomUUID();
      if (other)
        await f.db
          .getRepository(Product)
          .update(f.product.id, { reservedOrderId: otherId });
      await service.inspect(f.owner.id, f.shop.id, f.order.id, {
        ...input,
        condition: 'DAMAGED',
      });
      const product = await f.db
        .getRepository(Product)
        .findOneByOrFail({ id: f.product.id });
      expect(product.status).toBe(
        other ? ProductStatus.HELD : ProductStatus.HIDDEN,
      );
      expect(product.reservedOrderId).toBe(other ? otherId : null);
    }
  });
  it('preserves moderation, shop, category and suspended-stock guards for sellable returns', async () => {
    for (const change of [
      'moderation',
      'shop',
      'category',
      'suspended',
      'reserved',
    ]) {
      const f = await fixture();
      if (change === 'moderation')
        await f.db
          .getRepository(ProductModeration)
          .update(
            { productId: f.product.id },
            { status: ProductModerationStatus.PENDING },
          );
      if (change === 'shop')
        await f.db
          .getRepository(Shop)
          .update(f.shop.id, { status: ShopStatus.INACTIVE });
      if (change === 'category')
        await f.db
          .getRepository(Category)
          .update(f.category.id, { isActive: false });
      if (change === 'suspended')
        await f.db
          .getRepository(Product)
          .update(f.product.id, { status: ProductStatus.SUSPENDED });
      if (change === 'reserved')
        await f.db
          .getRepository(Product)
          .update(f.product.id, { reservationId: randomUUID() });
      await service.inspect(f.owner.id, f.shop.id, f.order.id, input);
      const product = await f.db
        .getRepository(Product)
        .findOneByOrFail({ id: f.product.id });
      expect(product.status).toBe(
        change === 'suspended'
          ? ProductStatus.SUSPENDED
          : change === 'reserved'
            ? ProductStatus.HELD
            : ProductStatus.HIDDEN,
      );
    }
  });
  it('rolls back stock release and cancellation if the inspection audit cannot be recorded', async () => {
    const f = await fixture();
    await f.db.query(
      "CREATE FUNCTION fail_return_inspection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'inspection audit unavailable'; END $$",
    );
    await f.db.query(
      'CREATE TRIGGER fail_return_inspection BEFORE INSERT ON shipment_return_inspections FOR EACH ROW EXECUTE FUNCTION fail_return_inspection()',
    );
    try {
      await expect(
        service.inspect(f.owner.id, f.shop.id, f.order.id, input),
      ).rejects.toThrow('inspection audit unavailable');
      expect(
        (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
          .status,
      ).toBe('returns');
      const product = await f.db
        .getRepository(Product)
        .findOneByOrFail({ id: f.product.id });
      expect(product.status).toBe(ProductStatus.HELD);
      expect(product.reservedOrderId).toBe(f.order.id);
    } finally {
      await f.db.query(
        'DROP TRIGGER fail_return_inspection ON shipment_return_inspections',
      );
      await f.db.query('DROP FUNCTION fail_return_inspection()');
    }
  });

  it('requires an active owner even for replay', async () => {
    const f = await fixture();
    await expect(
      new AuthorizationService(f.db).authorize(
        f.buyer.id,
        f.shop.id,
        'shop.owner',
      ),
    ).rejects.toThrow('Shop permission denied');
    await f.db.getRepository(ShopMember).delete(f.member.id);
    await expect(
      new AuthorizationService(f.db).authorize(
        f.owner.id,
        f.shop.id,
        'shop.owner',
      ),
    ).rejects.toThrow('Shop permission denied');
  });
  it('denies missing return evidence and non-COD orders without changing stock', async () => {
    for (const change of ['order-return', 'shipment-return', 'momo']) {
      const f = await fixture();
      if (change === 'order-return')
        await f.db
          .getRepository(Order)
          .update(f.order.id, { carrierReturnedAt: null });
      if (change === 'shipment-return')
        await f.db
          .getRepository(Shipment)
          .update(f.shipment.id, { providerStatus: 'returning' });
      if (change === 'momo')
        await f.db
          .getRepository(Order)
          .update(f.order.id, { paymentMethod: 'MOMO' });
      await expect(
        service.inspect(f.owner.id, f.shop.id, f.order.id, input),
      ).rejects.toThrow('Verified uncollected COD return required');
      expect(
        await f.db
          .getRepository(ShipmentReturnInspection)
          .countBy({ orderId: f.order.id }),
      ).toBe(0);
    }
  });
  it('requires admin reconciliation for collected or transferred returned parcels', async () => {
    for (const field of [
      'codCollectedAt',
      'carrierTransferredAt',
      'deliveryObservedAt',
    ] as const) {
      const f = await fixture();
      if (field === 'deliveryObservedAt')
        await f.db
          .getRepository(Order)
          .update(f.order.id, { deliveryObservedAt: new Date() });
      else
        await f.db
          .getRepository(Shipment)
          .update(f.shipment.id, { [field]: new Date() });
      const result = await service.inspect(
        f.owner.id,
        f.shop.id,
        f.order.id,
        input,
      );
      expect(result.requiresAdmin).toBe(true);
      expect(result.inspection).toBeNull();
      expect(
        (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
          .cancelState,
      ).toBe('ADMIN_REVIEW');
      expect(
        (
          await f.db
            .getRepository(Product)
            .findOneByOrFail({ id: f.product.id })
        ).status,
      ).toBe(ProductStatus.HELD);
    }
  });
  it('never releases a returned snapshot with unresolved carrier contradictions, including repeated inspection', async () => {
    const f = await fixture();
    await f.db
      .getRepository(Shipment)
      .update(f.shipment.id, { reviewReason: 'CARRIER_DATA_MISMATCH' });
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await service.inspect(
        f.owner.id,
        f.shop.id,
        f.order.id,
        input,
      );
      expect(result.requiresAdmin).toBe(true);
      expect(result.inspection).toBeNull();
      expect(
        (
          await f.db
            .getRepository(Product)
            .findOneByOrFail({ id: f.product.id })
        ).status,
      ).toBe(ProductStatus.HELD);
      expect(
        (
          await f.db
            .getRepository(Shipment)
            .findOneByOrFail({ id: f.shipment.id })
        ).reviewReason,
      ).toBe('CARRIER_DATA_MISMATCH');
    }
  });
});
