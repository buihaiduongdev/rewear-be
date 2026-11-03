import { GhnSandboxAdapter } from '@/infrastructure/shipping/ghn-sandbox.adapter';
import type { CarrierQuoteInput } from '@/infrastructure/shipping/ghn-sandbox.adapter';

const source = {
  name: 'Sender',
  phone: '0912345678',
  addressLine1: '45 Test Street',
  countryCode: 'VN',
  provinceName: 'Thành phố Hồ Chí Minh',
  wardName: 'Phường Sài Gòn',
};
const input: CarrierQuoteInput = {
  from: source,
  to: {
    ...source,
    name: 'Receiver',
    provinceName: 'Thành phố Hà Nội',
    wardName: 'Phường Ba Đình',
  },
  parcel: { weightGrams: 800, lengthCm: 30, widthCm: 20, heightCm: 25 },
  value: 500000,
};
const keys = [
  'GHN_SANDBOX_ENABLED',
  'GHN_SANDBOX_TOKEN',
  'GHN_SANDBOX_SHOP_ID',
];
const original = keys.map((k) => process.env[k]);
let requests: Array<{ url: string; body: Record<string, unknown> }>;
let duplicateWard = false;
let badFee = false;
beforeEach(() => {
  Object.assign(process.env, {
    GHN_SANDBOX_ENABLED: 'true',
    GHN_SANDBOX_TOKEN: 'unit-test-token',
    GHN_SANDBOX_SHOP_ID: '123',
  });
  requests = [];
  duplicateWard = false;
  badFee = false;
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    const path = String(url);
    const body = JSON.parse(String(options?.body ?? '{}'));
    requests.push({ url: path, body });
    let data: unknown;
    if (path.includes('/province/all'))
      data = [
        {
          _id: 1,
          name: 'Hồ Chí Minh',
          status: 1,
          extension_names: ['thành phố hồ chí minh'],
        },
        { _id: 2, name: 'Hà Nội', status: 1 },
      ];
    else if (path.includes('/ward/')) {
      const name = path.includes('province_id=1&')
        ? 'Phường Sài Gòn'
        : 'Phường Ba Đình';
      data = [
        { _id: 10, name, status: 1 },
        ...(duplicateWard ? [{ _id: 11, name, status: 1 }] : []),
      ];
    } else
      data = {
        order_code: '',
        total_fee: badFee ? -1 : 20900,
        expected_delivery_time: '2026-11-01T16:59:59Z',
      };
    return new Response(JSON.stringify({ code: 200, data }), { status: 200 });
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  keys.forEach((k, i) => {
    if (original[i] === undefined) delete process.env[k];
    else process.env[k] = original[i];
  });
});

describe('GHN staging preview boundary', () => {
  it('quotes one parcel using canonical names, sender payer and zero COD without creating an order', async () => {
    expect(
      await new GhnSandboxAdapter().quote(input, AbortSignal.timeout(2000)),
    ).toEqual({ fee: 20900, estimatedDeliveryAt: '2026-11-01T16:59:59.000Z' });
    const sent = requests.find((r) => r.url.endsWith('/preview'))!;
    expect(sent.url).toBe(
      'https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/preview',
    );
    expect(sent.body).toMatchObject({
      payment_type_id: 1,
      cod_amount: 0,
      cod_failed_amount: 0,
      from_province_name: 'Hồ Chí Minh',
      to_province_name: 'Hà Nội',
      is_new_from_address: true,
      is_new_to_address: true,
      weight: 800,
      height: 25,
      insurance_value: 500000,
    });
    expect(sent.body.items).toEqual([
      {
        name: 'Rewear combined parcel',
        quantity: 1,
        price: 500000,
        weight: 800,
        length: 30,
        width: 20,
        height: 25,
      },
    ]);
    expect(requests.some((r) => r.url.endsWith('/create'))).toBe(false);
  });
  it('fails closed for ambiguous ward names', async () => {
    duplicateWard = true;
    await expect(
      new GhnSandboxAdapter().quote(input, AbortSignal.timeout(2000)),
    ).rejects.toThrow('ADDRESS_MAPPING_UNAVAILABLE');
    expect(requests.some((r) => r.url.endsWith('/preview'))).toBe(false);
  });
  it('rejects malformed provider fees rather than inventing a free delivery', async () => {
    badFee = true;
    await expect(
      new GhnSandboxAdapter().quote(input, AbortSignal.timeout(2000)),
    ).rejects.toThrow('CARRIER_UNAVAILABLE');
  });
  it('does not contact a carrier when disabled', async () => {
    process.env.GHN_SANDBOX_ENABLED = 'false';
    await expect(
      new GhnSandboxAdapter().quote(input, AbortSignal.timeout(2000)),
    ).rejects.toThrow('CARRIER_NOT_CONFIGURED');
    expect(requests).toHaveLength(0);
  });
  it('uses one heavy parcel and rejects unsupported declared values instead of silently capping', async () => {
    await new GhnSandboxAdapter().quote(
      { ...input, parcel: { ...input.parcel, weightGrams: 20000 } },
      AbortSignal.timeout(2000),
    );
    const body = requests.find((r) => r.url.endsWith('/preview'))!.body;
    expect(body.service_type_id).toBe(5);
    expect(body.items).toHaveLength(1);
    await expect(
      new GhnSandboxAdapter().quote(
        { ...input, value: 5000001 },
        AbortSignal.timeout(2000),
      ),
    ).rejects.toThrow('DECLARED_VALUE_LIMIT');
  });
});
