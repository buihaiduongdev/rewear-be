import { randomUUID } from 'node:crypto';

import { ShopFactory } from '@/database/factories/shop.factory';
import { UserFactory } from '@/database/factories/user.factory';
import { CodPolicy } from '@/modules/cod/cod.policy';
import { OrderAccess } from '@/modules/order/order.access';
import { Order } from '@/modules/order/order.entity';
import { OrderService } from '@/modules/order/order.service';
import { CarrierIncident } from '@/modules/shipment/carrier-incident.entity';
import { CarrierIncidentService } from '@/modules/shipment/carrier-incident.service';
import { FulfillmentCalendar } from '@/modules/shipment/late-handover.entity';
import { Shipment } from '@/modules/shipment/shipment.entity';
import { Shop } from '@/modules/shop/entities';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';
import { WalletService } from '@/modules/wallet/wallet.service';

import { createTestDatabase, TestDatabase } from '../support/database';

describe('Carrier incident resolution (PostgreSQL)', () => {
  let database: TestDatabase;
  let service: CarrierIncidentService;
  beforeAll(async () => {
    database = await createTestDatabase();
    const db = database.dataSource;
    service = new CarrierIncidentService(
      db,
      new OrderService(
        db,
        new OrderAccess(),
        new WalletService(db),
        new CodPolicy(db),
      ),
    );
  });
  afterAll(async () => database?.destroy());

  async function fixture(at = new Date(Date.now() - 3600000)) {
    const db = database.dataSource;

    const buyer = await db.getRepository(User).save(
      new UserFactory().build({
        role: UserRole.ADMIN,
        password: 'unused',
      }),
    );
    const shop = await db.getRepository(Shop).save(new ShopFactory().build());
    const order = await db.getRepository(Order).save({
      checkoutOrderId: randomUUID(),
      buyerId: buyer.id,
      shopId: shop.id,
      shopName: shop.name,
      paymentMethod: 'COD',
      status: 'preparing',
      cancelState: 'APPROVED',
      subtotal: 0,
      shippingFee: 0,
      total: 0,
      address: {},
      items: [],
      sellerConfirmBy: new Date(),
    });
    const shipment = await db.getRepository(Shipment).save({
      orderId: order.id,
      state: 'CANCEL_PENDING',
      orderCode: randomUUID(),
      payload: {},
      input: {} as Shipment['input'],
      quotedParcel: {} as Shipment['quotedParcel'],
      codAmount: 0,
      cancelRequestedAt: at,
      providerStatus: 'ready_to_pick',
    });
    return { db, order, shipment };
  }

  it('opens once at the original timeout and fails closed without approved calendar coverage', async () => {
    const f = await fixture();
    await service.run();
    const first = await f.db
      .getRepository(CarrierIncident)
      .findOneByOrFail({ shipmentId: f.shipment.id });
    expect(first.openedAt.getTime()).toBe(
      f.shipment.cancelRequestedAt!.getTime() + 1800000,
    );
    expect(first.calendarMissing).toBe(true);
    expect(first.reviewDueAt).toBeNull();
    await service.run();
    const again = await f.db
      .getRepository(CarrierIncident)
      .findOneByOrFail({ shipmentId: f.shipment.id });
    expect(again.id).toBe(first.id);
    expect(again.openedAt).toEqual(first.openedAt);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('preparing');
  });

  it('stores explicit admin confirmation, closes safely without forging provider status, and preserves audit', async () => {
    const f = await fixture();
    await service.run();
    const incident = await f.db
      .getRepository(CarrierIncident)
      .findOneByOrFail({ shipmentId: f.shipment.id });
    const adminId = randomUUID();
    const input = {
      outcome: 'CANCELLED_BEFORE_PICKUP' as const,
      reason: 'GHN confirms cancellation before pickup',
      evidence: 'GHN case 123 / operator confirmation',
    };
    const decided = await service.decide(adminId, incident.id, input);
    expect(decided.state).toBe('RESOLVED');
    expect(decided.events).toEqual([
      expect.objectContaining({
        ...input,
        actorId: adminId,
        at: expect.any(String),
      }),
    ]);
    const shipment = await f.db
      .getRepository(Shipment)
      .findOneByOrFail({ id: f.shipment.id });
    expect(shipment.state).toBe('CANCELLED');
    expect(shipment.providerStatus).toBe('ready_to_pick');
    expect(shipment.nextQueryAt).toBeNull();
    expect(shipment.reviewReason).toBe('ADMIN_CONFIRMED_CANCELLATION');
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('cancelled');
    await expect(
      service.decide(randomUUID(), incident.id, input),
    ).rejects.toThrow('already resolved');
    expect(
      (
        await f.db
          .getRepository(CarrierIncident)
          .findOneByOrFail({ id: incident.id })
      ).events,
    ).toEqual(decided.events);
  });

  it('keeps review visible and appends direction without restarting the SLA', async () => {
    const f = await fixture();
    await service.run();
    const incident = await f.db
      .getRepository(CarrierIncident)
      .findOneByOrFail({ shipmentId: f.shipment.id });
    const decided = await service.decide(randomUUID(), incident.id, {
      outcome: 'KEEP_REVIEW',
      reason: 'Await warehouse check',
      evidence: 'GHN case 321',
    });
    expect(decided.state).toBe('REVIEW');
    expect(decided.openedAt).toEqual(incident.openedAt);
    expect(decided.reviewDueAt).toEqual(incident.reviewDueAt);
    expect((await service.incidents()).map((row) => row.id)).toContain(
      incident.id,
    );
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('preparing');
  });

  it.each([
    'pickedObservedAt',
    'codCollectedAt',
    'carrierTransferredAt',
    'deliveryObservedAt',
    'carrierReturnedAt',
  ])(
    'refuses cancellation after %s and retains stock reservation',
    async (field) => {
      const f = await fixture();
      await service.run();
      const incident = await f.db
        .getRepository(CarrierIncident)
        .findOneByOrFail({ shipmentId: f.shipment.id });
      if (field === 'deliveryObservedAt' || field === 'carrierReturnedAt') {
        await f.db
          .getRepository(Order)
          .update(f.order.id, { [field]: new Date() });
      } else {
        await f.db
          .getRepository(Shipment)
          .update(f.shipment.id, { [field]: new Date() });
      }
      await expect(
        service.decide(randomUUID(), incident.id, {
          outcome: 'CANCELLED_BEFORE_PICKUP',
          reason: 'Confirmed',
          evidence: 'GHN call',
        }),
      ).rejects.toThrow('safe carrier state');
      expect(
        (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
          .status,
      ).toBe('preparing');
      expect(
        (
          await f.db
            .getRepository(CarrierIncident)
            .findOneByOrFail({ id: incident.id })
        ).events,
      ).toHaveLength(0);
    },
  );

  it('waits for next-year coverage, then derives the original SLA and only flags overdue', async () => {
    const f = await fixture(new Date('2020-12-31T01:00:00Z'));
    const calendars = f.db.getRepository(FulfillmentCalendar);
    await calendars.save({
      year: 2020,
      closedDates: [],
      source: 'Approved fixture',
      approvedBy: randomUUID(),
    });
    await service.run();
    const missing = await f.db
      .getRepository(CarrierIncident)
      .findOneByOrFail({ shipmentId: f.shipment.id });
    expect(missing.reviewDueAt).toBeNull();
    expect(missing.calendarMissing).toBe(true);
    await calendars.save({
      year: 2021,
      closedDates: ['2021-01-01'],
      source: 'Approved fixture',
      approvedBy: randomUUID(),
    });
    await service.run();
    const covered = await f.db
      .getRepository(CarrierIncident)
      .findOneByOrFail({ shipmentId: f.shipment.id });
    expect(covered.openedAt).toEqual(new Date('2020-12-31T01:30:00Z'));
    expect(covered.reviewDueAt).toEqual(new Date('2021-01-04T10:00:00Z'));
    expect(covered.calendarMissing).toBe(false);
    expect(covered.overdue).toBe(true);
    await calendars.update(2021, { closedDates: [] });
    await service.run();
    expect(
      (
        await f.db
          .getRepository(CarrierIncident)
          .findOneByOrFail({ id: covered.id })
      ).reviewDueAt,
    ).toEqual(covered.reviewDueAt);
    expect(
      (await f.db.getRepository(Order).findOneByOrFail({ id: f.order.id }))
        .status,
    ).toBe('preparing');
    expect(
      (
        await f.db
          .getRepository(Shipment)
          .findOneByOrFail({ id: f.shipment.id })
      ).state,
    ).toBe('CANCEL_PENDING');
  });

  it('closes a review after automatic verified cancellation without inventing an admin audit', async () => {
    const f = await fixture();
    await service.run();
    const incident = await f.db
      .getRepository(CarrierIncident)
      .findOneByOrFail({ shipmentId: f.shipment.id });
    await f.db
      .getRepository(Shipment)
      .update(f.shipment.id, { state: 'CANCELLED' });
    await f.db.getRepository(Order).update(f.order.id, { status: 'cancelled' });
    await service.run();
    const resolved = await f.db
      .getRepository(CarrierIncident)
      .findOneByOrFail({ id: incident.id });
    expect(resolved.state).toBe('RESOLVED');
    expect(resolved.events).toEqual([]);
    expect(resolved.openedAt).toEqual(incident.openedAt);
    expect((await service.incidents()).map((row) => row.id)).not.toContain(
      incident.id,
    );
  });

  it('ignores cancellations before the timeout and creates only one case under concurrent detection', async () => {
    const recent = await fixture(new Date());
    await service.run();
    expect(
      await recent.db
        .getRepository(CarrierIncident)
        .countBy({ shipmentId: recent.shipment.id }),
    ).toBe(0);
    const old = await fixture();
    await Promise.all([service.run(), service.run()]);
    expect(
      await old.db
        .getRepository(CarrierIncident)
        .countBy({ shipmentId: old.shipment.id }),
    ).toBe(1);
  });

  it.each([
    { paymentMethod: 'MOMO' as const },
    { status: 'shipping' as const },
    { cancelState: 'ADMIN_REVIEW' as const },
  ])('requires eligible approved COD order %j', async (change) => {
    const f = await fixture();
    await service.run();
    const incident = await f.db
      .getRepository(CarrierIncident)
      .findOneByOrFail({ shipmentId: f.shipment.id });
    await f.db.getRepository(Order).update(f.order.id, change);
    await expect(
      service.decide(randomUUID(), incident.id, {
        outcome: 'CANCELLED_BEFORE_PICKUP',
        reason: 'Confirmed',
        evidence: 'GHN case',
      }),
    ).rejects.toThrow('safe carrier state');
    expect(
      (
        await f.db
          .getRepository(CarrierIncident)
          .findOneByOrFail({ id: incident.id })
      ).state,
    ).toBe('REVIEW');
  });
  it('lets admin discover incident IDs beyond the first 100 persistent cases', async () => {
    let lastId = '';
    for (let index = 0; index < 101; index++) {
      const f = await fixture();
      const incident = await f.db.getRepository(CarrierIncident).save({
        shipmentId: f.shipment.id,
        state: 'REVIEW',
        openedAt: new Date(Date.UTC(2099, 0, 1) + index),
        reviewDueAt: null,
        calendarMissing: true,
        overdue: false,
        events: [],
      });
      lastId = incident.id;
    }
    const count = await database.dataSource
      .getRepository(CarrierIncident)
      .countBy({ state: 'REVIEW' });
    expect((await service.incidents({ offset: count - 1 }))[0].id).toBe(lastId);
    expect(
      (await service.incidents()).some((incident) => incident.id === lastId),
    ).toBe(false);
  });
});
