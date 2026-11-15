import { randomUUID } from 'node:crypto';

import { MarketplaceFactory } from '@/modules/database/seeds/factories/marketplace.factory';
import {
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
} from '@/modules/order/order.constants';
import { Order } from '@/modules/order/order.entity';
import { FulfillmentCalendar } from '@/modules/shipment/late-handover.entity';
import { ReturnInspectionDeadlineService } from '@/modules/shipment/return-inspection-deadline.service';
import { ShipmentReturnInspection } from '@/modules/shipment/shipment-return-inspection.entity';
import { Shipment } from '@/modules/shipment/shipment.entity';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';

import { createTestDatabase, TestDatabase } from '../support/database';

describe('Return inspection deadlines (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: ReturnInspectionDeadlineService;
  beforeAll(async () => {
    database = await createTestDatabase();
    service = new ReturnInspectionDeadlineService(database.dataSource);
  });
  afterAll(async () => database?.destroy());

  async function fixture(returnedAt: Date, reviewReason: string | null = null) {
    const db = database.dataSource;
    const factory = new MarketplaceFactory(randomUUID());
    const buyer = await db.getRepository(User).save(factory.user(0, 'unused'));
    const shop = await db.getRepository(Shop).save(factory.shop(0));
    const order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      buyerId: buyer.id,
      shopId: shop.id,
      shopName: shop.name,
      paymentMethod: ORDER_PAYMENT_METHOD.COD,
      status: ORDER_STATUS.RETURNS,
      carrierReturnedAt: returnedAt,
      subtotal: 0,
      shippingFee: 0,
      total: 0,
      address: {},
      items: [],
      sellerConfirmBy: new Date(),
    });
    const shipment = await db.getRepository(Shipment).save({
      orderId: order.id,
      state: 'BOOKED',
      orderCode: randomUUID(),
      payload: {},
      input: {} as Shipment['input'],
      quotedParcel: {} as Shipment['quotedParcel'],
      codAmount: 0,
      providerStatus: 'returned',
      reviewReason,
    });
    return { db, buyer, order, shipment };
  }

  it('flags missing calendar without inventing a deadline or releasing the order', async () => {
    const f = await fixture(new Date('2019-11-15T01:00:00Z'));
    await service.run();
    const saved = await f.db
      .getRepository(Shipment)
      .findOneByOrFail({ id: f.shipment.id });
    expect(saved.returnInspectionBy).toBeNull();
    expect(saved.returnInspectionCalendarMissing).toBe(true);
    expect(saved.returnInspectionOverdue).toBe(false);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe(ORDER_STATUS.RETURNS);
  });

  it('counts two business days across a holiday and weekend, fixes the SLA once and only flags overdue', async () => {
    const f = await fixture(
      new Date('2020-12-31T01:00:00Z'),
      'UNSAFE_CARRIER_HISTORY',
    );
    const calendars = f.db.getRepository(FulfillmentCalendar);
    await calendars.save({
      year: 2020,
      closedDates: [],
      source: 'Approved fixture',
      approvedBy: randomUUID(),
    });
    await service.run();
    expect(
      (
        await f.db
          .getRepository(Shipment)
          .findOneByOrFail({ id: f.shipment.id })
      ).returnInspectionBy,
    ).toBeNull();
    await calendars.save({
      year: 2021,
      closedDates: ['2021-01-01'],
      source: 'Approved fixture',
      approvedBy: randomUUID(),
    });
    await service.run();
    const saved = await f.db
      .getRepository(Shipment)
      .findOneByOrFail({ id: f.shipment.id });
    expect(saved.returnInspectionBy).toEqual(new Date('2021-01-05T10:00:00Z'));
    expect(saved.returnInspectionCalendarMissing).toBe(false);
    expect(saved.returnInspectionOverdue).toBe(true);
    expect(saved.reviewReason).toBe('UNSAFE_CARRIER_HISTORY');
    await calendars.update(2021, { closedDates: [] });
    await service.run();
    expect(
      (
        await f.db
          .getRepository(Shipment)
          .findOneByOrFail({ id: f.shipment.id })
      ).returnInspectionBy,
    ).toEqual(saved.returnInspectionBy);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe(ORDER_STATUS.RETURNS);
  });

  it('marks an unlabelled overdue return for review and excludes already inspected returns', async () => {
    const f = await fixture(new Date('2020-12-30T01:00:00Z'));
    await service.run();
    const saved = await f.db
      .getRepository(Shipment)
      .findOneByOrFail({ id: f.shipment.id });
    expect(saved.reviewReason).toBe('RETURN_INSPECTION_OVERDUE');
    const inspected = await fixture(new Date('2020-12-30T01:00:00Z'));
    await inspected.db.getRepository(ShipmentReturnInspection).save({
      orderId: inspected.order.id,
      actorId: inspected.buyer.id,
      condition: 'SELLABLE',
      reason: 'Checked',
      evidence: 'Photo',
    });
    await service.run();
    const skipped = await inspected.db
      .getRepository(Shipment)
      .findOneByOrFail({ id: inspected.shipment.id });
    expect(skipped.returnInspectionBy).toBeNull();
    expect(skipped.reviewReason).toBeNull();
  });
});
