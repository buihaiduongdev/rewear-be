import { randomUUID } from 'node:crypto';

import {
  GhnShipmentClient,
  type GhnShipmentSnapshot,
} from '@/infrastructure/shipping/clients/ghn-shipment.client';
import { DisputeAccess } from '@/modules/dispute/dispute.access';
import { DisputeReturn } from '@/modules/dispute/returns/entities/dispute-return.entity';
import { ReturnBooking } from '@/modules/dispute/returns/entities/return-booking.entity';
import { ReturnBookingService } from '@/modules/dispute/returns/return-booking.service';
import { OrderAccess } from '@/modules/order/order.access';

import { createTestDatabase, type TestDatabase } from '../support/database';
import { disputeReturnFixture } from '../support/dispute-return-fixture';

describe('Reverse GHN booking persistence and recovery (PostgreSQL, mocked provider)', () => {
  let database: TestDatabase;
  const previous = {
    GHN_SANDBOX_SHOP_ID: process.env.GHN_SANDBOX_SHOP_ID,
    GHN_SANDBOX_TOKEN: process.env.GHN_SANDBOX_TOKEN,
    GHN_BOOKING_ENABLED: process.env.GHN_BOOKING_ENABLED,
    GHN_SANDBOX_ENABLED: process.env.GHN_SANDBOX_ENABLED,
  };
  beforeAll(async () => {
    database = await createTestDatabase();
    Object.assign(process.env, {
      GHN_SANDBOX_SHOP_ID: '12345',
      GHN_SANDBOX_TOKEN: 'test-token',
      GHN_BOOKING_ENABLED: 'true',
      GHN_SANDBOX_ENABLED: 'true',
    });
  });
  afterAll(async () => {
    await database?.destroy();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const input = () => ({
    requestId: randomUUID(),
    parcel: { weightGrams: 500, lengthCm: 30, widthCm: 20, heightCm: 10 },
  });
  function provider() {
    let creates = 0;
    const prefix = randomUUID();
    const codes = new Map<string, string>();
    let status = 'ready_to_pick',
      failCreate = false;
    const client = {
      create: async (payload: Record<string, unknown>) => {
        creates++;
        codes.set(String(payload.client_order_code), prefix + creates);
        if (failCreate) throw new Error('lost create response');
        return {
          orderCode: prefix + creates,
          fee: 30000,
          estimatedDeliveryAt: null,
        };
      },
      query: async (clientCode: string): Promise<GhnShipmentSnapshot> => ({
        orderCode: codes.get(clientCode)!,
        clientCode,
        shopId: 12345,
        status,
        updatedAt: new Date().toISOString(),
        codAmount: 0,
        paymentType: 1,
        codCollected: false,
        codTransferred: false,
        collectedAt: null,
        transferredAt: null,
      }),
      print: async () => ({ url: 'https://private-carrier.test/label' }),
    } as unknown as GhnShipmentClient;
    return {
      client,
      get creates() {
        return creates;
      },
      set status(value: string) {
        status = value;
      },
      set failCreate(value: boolean) {
        failCreate = value;
      },
    };
  }
  it('creates a distinct zero-COD reverse parcel, freezes route and starts handover only after query confirmation', async () => {
    const f = await disputeReturnFixture(database.dataSource, 'SIMULATION'),
      fake = provider();
    const service = new ReturnBookingService(
      f.db,
      fake.client,
      new DisputeAccess(new OrderAccess()),
    );
    const request = input();
    const booked = await service.book(f.admin.id, f.returned.id, request);
    expect(booked).toMatchObject({
      state: 'BOOKED',
      mode: 'SIMULATION',
      active: true,
    });
    expect(booked.payload).toMatchObject({
      cod_amount: 0,
      payment_type_id: 1,
      from_name: 'Buyer',
      to_name: 'Shop',
    });
    await service.book(f.admin.id, f.returned.id, request);
    expect(fake.creates).toBe(1);
    const returned = await f.db
      .getRepository(DisputeReturn)
      .findOneByOrFail({ id: f.returned.id });
    expect(returned.labelCode).toBe(booked.orderCode);
    expect(returned.handoverAt).toBeNull();
    expect(returned.deliveredAt).toBeNull();
    expect(await service.print(f.buyer.id, f.returned.id)).toMatchObject({
      url: 'https://private-carrier.test/label',
    });
  });
  it('unknown create results recover by the same client code without creating another parcel', async () => {
    const f = await disputeReturnFixture(database.dataSource, 'SIMULATION'),
      fake = provider();
    fake.failCreate = true;
    const service = new ReturnBookingService(
      f.db,
      fake.client,
      new DisputeAccess(new OrderAccess()),
    );
    const request = input();
    await expect(
      service.book(f.admin.id, f.returned.id, request),
    ).rejects.toThrow('reconciliation');
    expect(
      await f.db
        .getRepository(ReturnBooking)
        .findOneByOrFail({ returnId: f.returned.id, active: true }),
    ).toMatchObject({ state: 'UNKNOWN' });
    await expect(
      service.reissue(f.admin.id, f.returned.id, input()),
    ).rejects.toThrow('Confirmed');
    fake.failCreate = false;
    expect(
      await service.book(f.admin.id, f.returned.id, request),
    ).toMatchObject({ state: 'BOOKED' });
    expect(fake.creates).toBe(1);
  });
  it('confirmed cancellation pauses the deadline and reissue archives the old parcel instead of overwriting it', async () => {
    const f = await disputeReturnFixture(database.dataSource, 'SIMULATION'),
      fake = provider();
    const service = new ReturnBookingService(
      f.db,
      fake.client,
      new DisputeAccess(new OrderAccess()),
    );
    const first = await service.book(f.admin.id, f.returned.id, input());
    fake.status = 'cancel';
    await service.refresh(f.admin.id, f.returned.id);
    expect(
      await f.db
        .getRepository(DisputeReturn)
        .findOneByOrFail({ id: f.returned.id }),
    ).toMatchObject({ state: 'PAUSED', labelReplacementRequired: true });
    await expect(service.print(f.buyer.id, f.returned.id)).rejects.toThrow(
      'label',
    );
    // Old-client query confirms cancellation; a newly created client is ready to pick.
    const originalQuery = fake.client.query.bind(fake.client);
    fake.client.query = async (clientCode: string) => ({
      ...(await originalQuery(clientCode)),
      status: clientCode === first.clientCode ? 'cancel' : 'ready_to_pick',
    });
    const second = await service.reissue(f.admin.id, f.returned.id, input());
    expect(second.clientCode).not.toBe(first.clientCode);
    expect(fake.creates).toBe(2);
    expect(
      await f.db
        .getRepository(ReturnBooking)
        .countBy({ returnId: f.returned.id }),
    ).toBe(2);
    expect(
      await f.db.getRepository(ReturnBooking).findOneByOrFail({ id: first.id }),
    ).toMatchObject({ active: false, orderCode: first.orderCode });
    expect(
      await f.db
        .getRepository(DisputeReturn)
        .findOneByOrFail({ id: f.returned.id }),
    ).toMatchObject({
      state: 'AWAITING_HANDOVER',
      labelCode: second.orderCode,
      labelReplacementRequired: false,
    });
  });

  it('does not start a buyer clock for a recovered cancelled creation, and can safely issue a first usable replacement', async () => {
    const f = await disputeReturnFixture(database.dataSource, 'SIMULATION'),
      fake = provider();
    fake.failCreate = true;
    const service = new ReturnBookingService(
      f.db,
      fake.client,
      new DisputeAccess(new OrderAccess()),
    );
    const data = input();
    await expect(service.book(f.admin.id, f.returned.id, data)).rejects.toThrow(
      'reconciliation',
    );
    fake.failCreate = false;
    fake.status = 'cancel';
    const cancelled = await service.refresh(f.admin.id, f.returned.id);
    expect(cancelled).toMatchObject({ state: 'BOOKED', reviewRequired: true });
    expect(
      (
        await f.db
          .getRepository(DisputeReturn)
          .findOneByOrFail({ id: f.returned.id })
      ).handoverBy,
    ).toBeNull();
    const query = fake.client.query.bind(fake.client);
    fake.client.query = async (code) => ({
      ...(await query(code)),
      status: code === cancelled.clientCode ? 'cancel' : 'ready_to_pick',
    });
    expect(
      await service.reissue(f.admin.id, f.returned.id, input()),
    ).toMatchObject({ state: 'BOOKED' });
    expect(
      (
        await f.db
          .getRepository(DisputeReturn)
          .findOneByOrFail({ id: f.returned.id })
      ).handoverBy,
    ).toBeInstanceOf(Date);
  });

  it('background reconciliation recovers an unknown creation by query without another create', async () => {
    const f = await disputeReturnFixture(database.dataSource, 'SIMULATION'),
      fake = provider();
    fake.failCreate = true;
    const service = new ReturnBookingService(
      f.db,
      fake.client,
      new DisputeAccess(new OrderAccess()),
    );
    await expect(
      service.book(f.admin.id, f.returned.id, input()),
    ).rejects.toThrow('reconciliation');
    fake.failCreate = false;
    await service.poll();
    expect(
      await f.db
        .getRepository(ReturnBooking)
        .findOneByOrFail({ returnId: f.returned.id, active: true }),
    ).toMatchObject({ state: 'BOOKED' });
    expect(fake.creates).toBe(1);
  });
});
