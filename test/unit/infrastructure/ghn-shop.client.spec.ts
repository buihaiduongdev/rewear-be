import { GhnShopClient } from '@/infrastructure/shipping/clients/ghn-shop.client';

const keys = [
  'GHN_SANDBOX_ENABLED',
  'GHN_SANDBOX_TOKEN',
  'GHN_SANDBOX_SHOP_ID',
];
const original = keys.map((key) => process.env[key]);
const input = {
  name: 'Example shop',
  phone: '0912345678',
  address: '1 Example Street',
  districtId: 123,
  wardCode: '12345',
};

beforeEach(() => {
  Object.assign(process.env, {
    GHN_SANDBOX_ENABLED: 'true',
    GHN_SANDBOX_TOKEN: 'test-token',
    GHN_SANDBOX_SHOP_ID: '321',
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  keys.forEach((key, index) => {
    if (original[index] === undefined) delete process.env[key];
    else process.env[key] = original[index];
  });
});

it('uses the platform account and returns the new GHN shop ID', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ code: 200, data: { shop_id: 456 } }), {
      status: 200,
    }),
  );
  await expect(new GhnShopClient().create(input)).resolves.toEqual({
    status: 'CREATED',
    shopId: 456,
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ ShopId: '321' });
});

it('keeps uncertain results unknown without issuing another creation request', async () => {
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('timeout'));
  await expect(new GhnShopClient().create(input)).resolves.toEqual({
    status: 'UNKNOWN',
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('returns an empty list for an unavailable GHN district catalogue', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify({ code: 200, data: null }), { status: 200 }),
    );
  await expect(new GhnShopClient().districts(1)).resolves.toEqual([]);
});
