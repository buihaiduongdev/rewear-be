import {
  type CarrierQuoteInput,
  GhnSandboxAdapter,
} from '@/infrastructure/shipping/ghn-sandbox.adapter';
import { GhnShipmentClient } from '@/infrastructure/shipping/ghn-shipment.client';

const id = '55eb1e27-2a90-4b73-8856-47f2485bdc42';
const address = {
  name: 'Test',
  phone: '0912345678',
  addressLine1: 'Test street',
  countryCode: 'VN',
  provinceName: 'Province',
  wardName: 'Ward',
};
const input: CarrierQuoteInput = {
  from: address,
  to: address,
  parcel: { weightGrams: 800, lengthCm: 30, widthCm: 20, heightCm: 25 },
  value: 500000,
};
const keys = [
  'GHN_BOOKING_ENABLED',
  'GHN_SANDBOX_ENABLED',
  'GHN_SANDBOX_TOKEN',
  'GHN_SANDBOX_SHOP_ID',
];
const original = keys.map((k) => process.env[k]);
let data: unknown;
let status: number;
let requests: Array<{ url: string; options: RequestInit | undefined }>;
let client: GhnShipmentClient;
beforeEach(() => {
  Object.assign(process.env, {
    GHN_BOOKING_ENABLED: 'true',
    GHN_SANDBOX_ENABLED: 'true',
    GHN_SANDBOX_TOKEN: 'secret-token',
    GHN_SANDBOX_SHOP_ID: '123',
  });
  requests = [];
  status = 200;
  data = {
    order_code: 'GHN123',
    client_order_code: id,
    shop_id: 123,
    status: 'delivered',
    updated_date: '2026-11-01T01:00:00Z',
    cod_amount: 530000,
    payment_type_id: 1,
    is_cod_collected: false,
    is_cod_transferred: false,
    cod_collect_date: null,
    cod_transfer_date: null,
  };
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    requests.push({ url: String(url), options });
    const path = String(url);
    const result = path.includes('/province/all')
      ? [{ _id: 1, name: 'Province', status: 1 }]
      : path.includes('/ward/')
        ? [{ _id: 2, name: 'Ward', status: 1 }]
        : data;
    return new Response(
      JSON.stringify({
        code: status,
        data: result,
        message: 'secret-token private-address',
      }),
      { status },
    );
  });
  client = new GhnShipmentClient(new GhnSandboxAdapter());
});
afterEach(() => {
  jest.restoreAllMocks();
  keys.forEach((k, i) => {
    if (original[i] === undefined) delete process.env[k];
    else process.env[k] = original[i];
  });
});
it('prepares immutable sender-paid COD payload from canonical address mapping', async () => {
  const payload = await client.prepare(input, 530000, id);
  expect(payload).toMatchObject({
    client_order_code: id,
    cod_amount: 530000,
    cod_failed_amount: 0,
    payment_type_id: 1,
    insurance_value: 500000,
    from_ward_name: 'Ward',
  });
  expect(Object.isFrozen(payload)).toBe(true);
  expect(Object.isFrozen(payload.items)).toBe(true);
});
it.each([50000001, -1, 1.5])('rejects invalid COD %s', async (amount) => {
  await expect(client.prepare(input, amount, id)).rejects.toThrow(
    'GHN_BOOKING_UNAVAILABLE',
  );
  expect(requests).toHaveLength(0);
});
it('rejects parcel limits before address lookup', async () => {
  await expect(
    client.prepare(
      { ...input, parcel: { ...input.parcel, weightGrams: 0 } },
      530000,
      id,
    ),
  ).rejects.toThrow('GHN_BOOKING_UNAVAILABLE');
  expect(requests).toHaveLength(0);
});
it('requires explicit booking opt-in', async () => {
  delete process.env.GHN_BOOKING_ENABLED;
  await expect(client.query(id)).rejects.toThrow('GHN_BOOKING_UNAVAILABLE');
  expect(requests).toHaveLength(0);
});
it('queries exact client reference and keeps delivery independent of COD collection', async () => {
  expect(await client.query(id)).toEqual({
    orderCode: 'GHN123',
    clientCode: id,
    shopId: 123,
    status: 'delivered',
    updatedAt: '2026-11-01T01:00:00.000Z',
    codAmount: 530000,
    paymentType: 1,
    codCollected: false,
    codTransferred: false,
    collectedAt: null,
    transferredAt: null,
  });
  expect(requests[0].url).toContain(
    'detail-by-client-code?client_order_code=' + id,
  );
  expect(requests[0].options).toMatchObject({
    method: 'GET',
    redirect: 'error',
    headers: { Token: 'secret-token', ShopId: '123' },
  });
});
it.each([
  { shop_id: 124 },
  { client_order_code: 'wrong' },
  { cod_amount: -1 },
  { payment_type_id: 2 },
  { updated_date: 'invalid' },
  { is_cod_collected: 'true' },
])('rejects untrusted carrier snapshot %j', async (patch) => {
  data = { ...(data as object), ...patch };
  await expect(client.query(id)).rejects.toThrow('GHN_BOOKING_UNAVAILABLE');
});
it('sanitizes HTTP failures', async () => {
  status = 500;
  await expect(client.query(id)).rejects.toThrow('GHN_BOOKING_UNAVAILABLE');
});
it('creates prepared payload and returns sanitized result', async () => {
  const payload = await client.prepare(input, 530000, id);
  data = {
    order_code: 'GHN123',
    total_fee: 22000,
    expected_delivery_time: '2026-11-02T01:00:00Z',
  };
  expect(await client.create(payload)).toEqual({
    orderCode: 'GHN123',
    fee: 22000,
    estimatedDeliveryAt: '2026-11-02T01:00:00.000Z',
  });
  expect(requests.at(-1)?.url).toMatch(/shipping-order\/create$/);
});
it('matches cancellation result to requested order', async () => {
  data = [{ order_code: 'other', result: true }];
  await expect(client.cancel('GHN123')).rejects.toThrow(
    'GHN_BOOKING_UNAVAILABLE',
  );
  data = [{ order_code: 'GHN123', result: false }];
  expect(await client.cancel('GHN123')).toBe(false);
});
it('generates staging A5 print URL from an encoded token', async () => {
  data = { token: 'print-token' };
  expect(await client.print('GHN123')).toEqual({
    url: 'https://dev-online-gateway.ghn.vn/a5/public-api/printA5?token=print-token',
  });
  expect(requests[0].url).toMatch(/v2\/a5\/gen-token$/);
});
