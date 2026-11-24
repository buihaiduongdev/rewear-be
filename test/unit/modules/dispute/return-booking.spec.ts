import { ReturnBooking } from '@/modules/dispute/returns/entities/return-booking.entity';
import {
  ReturnBookingService,
  reverseReturnPayload,
} from '@/modules/dispute/returns/return-booking.service';
import { returnBookingInputSchema } from '@/modules/dispute/returns/schemas/return-booking.schema';

const id = '11111111-1111-4111-8111-111111111111';
const parcel = { weightGrams: 500, lengthCm: 20, widthCm: 15, heightCm: 10 };
const route = {
  from_name: 'Original shop',
  from_phone: '0901111111',
  from_address: 'Shop snapshot',
  from_district_id: 12,
  from_ward_code: 'A',
  to_name: 'Buyer',
  to_phone: '0902222222',
  to_address: 'Buyer snapshot',
  to_district_id: 34,
  to_ward_code: 'B',
};
describe('return reverse booking', () => {
  it('reverses original pickup route, ignores mutable forward COD and requires no buyer payment', () => {
    const payload = reverseReturnPayload(
      { ...route, cod_amount: 900000, return_phone: 'evil' },
      id,
      parcel,
    );
    expect(payload).toMatchObject({
      from_address: 'Buyer snapshot',
      to_address: 'Shop snapshot',
      from_district_id: 34,
      to_ward_code: 'A',
      cod_amount: 0,
      payment_type_id: 1,
      client_order_code: id,
      weight: 500,
    });
    expect(payload).not.toHaveProperty('return_phone');
  });
  it('holds missing routes and rejects arbitrary buyer provider payload or invalid parcel', () => {
    expect(() =>
      reverseReturnPayload({ ...route, from_ward_code: undefined }, id, parcel),
    ).toThrow('route requires review');
    expect(
      returnBookingInputSchema.safeParse({
        requestId: id,
        parcel,
        payload: route,
      }).success,
    ).toBe(false);
    expect(() =>
      reverseReturnPayload(route, id, { ...parcel, weightGrams: 0 }),
    ).toThrow('weight');
  });
  it.each(['UNKNOWN', 'CREATING'])(
    'queries %s outcome without ever creating another parcel',
    async (state) => {
      const booking = {
        returnId: id,
        clientCode: id,
        accountId: 12345,
        fingerprint: '',
        state,
        payload: route,
      };
      const manager = {
        query: jest.fn().mockResolvedValue([]),
        findOneByOrFail: jest.fn().mockResolvedValue(booking),
        findOneBy: jest.fn().mockResolvedValue(booking),
      };
      const db = {
        manager,
        transaction: jest.fn(async (callback) => callback(manager)),
      };
      const carrier = {
        create: jest.fn(),
        query: jest.fn().mockRejectedValue(new Error('unknown')),
      };
      const service = new ReturnBookingService(
        db as never,
        carrier as never,
        {} as never,
      );
      await expect(service.refresh(id, id)).rejects.toThrow('unknown');
      expect(manager.findOneByOrFail).toHaveBeenCalledWith(ReturnBooking, {
        returnId: id,
        active: true,
      });
      expect(carrier.query).toHaveBeenCalledWith(id, 12345);
      expect(carrier.create).not.toHaveBeenCalled();
    },
  );
  it('rejects foreign account, nonzero COD, and changed label before persisting', async () => {
    const db = { transaction: jest.fn() };
    const service = new ReturnBookingService(
      db as never,
      {} as never,
      {} as never,
    );
    const booking = {
      returnId: id,
      clientCode: id,
      accountId: 10,
      orderCode: 'RETURN1',
    };
    const snapshot = {
      clientCode: id,
      shopId: 10,
      orderCode: 'RETURN1',
      paymentType: 1,
      codAmount: 0,
      codCollected: false,
      codTransferred: false,
    };
    for (const change of [
      { shopId: 11 },
      { codAmount: 1 },
      { orderCode: 'FOREIGN' },
      { codCollected: true },
    ]) {
      await expect(
        (service as any).observe(booking, { ...snapshot, ...change }),
      ).rejects.toThrow('snapshot mismatch');
    }
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe('return booking cancellation safeguards', () => {
  const booking = {
    id,
    returnId: id,
    active: true,
    clientCode: id,
    accountId: 10,
    orderCode: 'RETURN1',
    state: 'BOOKED',
    mode: 'SIMULATION',
    reviewRequired: false,
    observedStatus: 'ready_to_pick',
  };
  const snapshot = {
    clientCode: id,
    shopId: 10,
    orderCode: 'RETURN1',
    paymentType: 1,
    codAmount: 0,
    codCollected: false,
    codTransferred: false,
    status: 'cancel',
  };
  it('pauses the exact remaining clock when signed cancellation makes a previously usable label unprintable', async () => {
    const obligation = {
      state: 'AWAITING_HANDOVER',
      labelCode: 'RETURN1',
      handoverAt: null,
      handoverBy: new Date(Date.now() + 3600000),
      remainingMs: null,
    };
    const current = { ...booking };
    const manager = {
      query: jest.fn(),
      save: jest.fn(async (row) => row),
      findOneByOrFail: jest
        .fn()
        .mockResolvedValueOnce(current)
        .mockResolvedValueOnce(obligation),
    };
    const db = { transaction: jest.fn(async (callback) => callback(manager)) };
    const carrier = {
      query: jest.fn().mockResolvedValue(snapshot),
      print: jest.fn(),
    };
    const service = new ReturnBookingService(
      db as never,
      carrier as never,
      {} as never,
    );
    jest.spyOn(service, 'view').mockResolvedValue(current as never);
    await expect(service.print(id, id)).rejects.toThrow(
      'Confirmed return label required',
    );
    expect(obligation).toMatchObject({
      state: 'PAUSED',
      labelReplacementRequired: true,
    });
    expect(obligation.remainingMs).toBeGreaterThan(3500000);
    expect(current).toMatchObject({
      observedStatus: 'cancel',
      reviewRequired: true,
    });
    expect(carrier.print).not.toHaveBeenCalled();
  });
  it('refuses review-required labels without printing', async () => {
    const carrier = { print: jest.fn(), query: jest.fn() };
    const service = new ReturnBookingService(
      {} as never,
      carrier as never,
      {} as never,
    );
    jest
      .spyOn(service, 'view')
      .mockResolvedValue({ ...booking, reviewRequired: true } as never);
    await expect(service.print(id, id)).rejects.toThrow('review');
    expect(carrier.print).not.toHaveBeenCalled();
  });
  it('does not reissue an UNKNOWN attempt, even before any carrier call', async () => {
    const manager = {
      findOneByOrFail: jest
        .fn()
        .mockResolvedValue({ ...booking, state: 'UNKNOWN' }),
      findOneBy: jest.fn().mockResolvedValue(null),
    };
    const carrier = { create: jest.fn(), query: jest.fn() };
    const service = new ReturnBookingService(
      { manager } as never,
      carrier as never,
      {} as never,
    );
    await expect(
      service.reissue(id, id, { requestId: id, parcel }),
    ).rejects.toThrow('Confirmed cancellation');
    expect(carrier.create).not.toHaveBeenCalled();
    expect(carrier.query).not.toHaveBeenCalled();
  });
});
