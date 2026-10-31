import { Injectable } from '@nestjs/common';

import z from 'zod';

export type CarrierAddress = {
  name: string;
  phone: string;
  addressLine1: string;
  countryCode: string;
  provinceName: string;
  wardName: string;
};
export type CarrierQuoteInput = {
  from: CarrierAddress;
  to: CarrierAddress;
  parcel: {
    weightGrams: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
  };
  value: number;
};
const origin = 'https://dev-online-gateway.ghn.vn/shiip/public-api';
const divisionsSchema = z.array(
  z.object({
    _id: z.number().int().positive(),
    name: z.string(),
    extension_names: z.array(z.string()).default([]),
    status: z.number(),
  }),
);
type Division = z.output<typeof divisionsSchema>[number];
const previewSchema = z.object({
  code: z.literal(200),
  data: z.object({
    order_code: z.literal(''),
    total_fee: z.number().int().nonnegative().max(2147483647),
    expected_delivery_time: z.string().datetime({ offset: true }).nullish(),
  }),
});
const normalized = (value: string) =>
  value.normalize('NFC').trim().toLocaleLowerCase('vi').replace(/\s+/g, ' ');
const provinceKey = (value: string) =>
  normalized(value).replace(/^(thành phố|tỉnh)\s+/u, '');

@Injectable()
export class GhnSandboxAdapter {
  private readonly catalog = new Map<
    string,
    { expiresAt: number; value: Promise<Division[]> }
  >();

  private config() {
    const token = process.env.GHN_SANDBOX_TOKEN;
    const shop = Number(process.env.GHN_SANDBOX_SHOP_ID);
    if (
      process.env.GHN_SANDBOX_ENABLED !== 'true' ||
      !token ||
      !Number.isSafeInteger(shop) ||
      shop <= 0
    )
      throw new Error('CARRIER_NOT_CONFIGURED');
    return { token, shop };
  }
  private async request(path: string, signal: AbortSignal, body?: unknown) {
    const { token, shop } = this.config();
    try {
      const response = await fetch(`${origin}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Token: token,
          ShopId: String(shop),
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
      });
      if (!response.ok) throw new Error('CARRIER_REJECTED');
      const json = await response.json();
      if (json?.code !== 200) throw new Error('CARRIER_REJECTED');
      return json as { code: number; data: unknown };
    } catch (error) {
      // No provider body, contact/address, credential or transport exception escapes.
      if (error instanceof Error && error.message === 'CARRIER_REJECTED')
        throw error;
      throw new Error('CARRIER_UNAVAILABLE');
    }
  }
  private async list(path: string, signal: AbortSignal) {
    const key = `${this.config().shop}:${path}`;
    const cached = this.catalog.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = this.request(path, signal)
      .then((json) => {
        const result = divisionsSchema.safeParse(json.data);
        if (!result.success) throw new Error('ADDRESS_MAPPING_UNAVAILABLE');
        return result.data;
      })
      .catch((error) => {
        this.catalog.delete(key);
        throw error;
      });
    this.catalog.set(key, { expiresAt: Date.now() + 3600000, value });
    return value;
  }
  private choose(list: Division[], name: string, province = false) {
    const key = province ? provinceKey : normalized;
    const matches = list.filter(
      (row) =>
        row.status === 1 &&
        [row.name, ...row.extension_names].some(
          (alias) => key(alias) === key(name),
        ),
    );
    if (matches.length !== 1) throw new Error('ADDRESS_MAPPING_UNAVAILABLE');
    return matches[0];
  }
  private async resolve(address: CarrierAddress, signal: AbortSignal) {
    if (address.countryCode !== 'VN')
      throw new Error('ADDRESS_MAPPING_UNAVAILABLE');
    const province = this.choose(
      await this.list(
        '/v3/master-data/province/all?offset=0&limit=200',
        signal,
      ),
      address.provinceName,
      true,
    );
    const ward = this.choose(
      await this.list(
        `/v3/master-data/ward/all-by-province-id?province_id=${province._id}&offset=0&limit=200`,
        signal,
      ),
      address.wardName,
    );
    return { province: province.name, ward: ward.name };
  }
  async quote(
    input: CarrierQuoteInput,
    signal: AbortSignal,
  ): Promise<{ fee: number; estimatedDeliveryAt: string | null }> {
    this.config();
    if (
      !Number.isSafeInteger(input.value) ||
      input.value < 0 ||
      input.value > 5000000
    )
      throw new Error('DECLARED_VALUE_LIMIT');
    const from = await this.resolve(input.from, signal);
    const to = await this.resolve(input.to, signal);
    const {
      weightGrams: weight,
      lengthCm: length,
      widthCm: width,
      heightCm: height,
    } = input.parcel;
    const payload = {
      payment_type_id: 1,
      required_note: 'KHONGCHOXEMHANG',
      cod_amount: 0,
      cod_failed_amount: 0,
      from_name: input.from.name,
      from_phone: input.from.phone,
      from_address: input.from.addressLine1,
      from_province_name: from.province,
      from_ward_name: from.ward,
      is_new_from_address: true,
      to_name: input.to.name,
      to_phone: input.to.phone,
      to_address: input.to.addressLine1,
      to_province_name: to.province,
      to_ward_name: to.ward,
      is_new_to_address: true,
      insurance_value: input.value,
      order_value: input.value,
      service_type_id: weight < 20000 ? 2 : 5,
      weight,
      length,
      width,
      height,
      content: 'Rewear combined parcel',
      items: [
        {
          name: 'Rewear combined parcel',
          quantity: 1,
          price: input.value,
          weight,
          length,
          width,
          height,
        },
      ],
    };
    const parsed = previewSchema.safeParse(
      await this.request('/v2/shipping-order/preview', signal, payload),
    );
    if (!parsed.success) throw new Error('CARRIER_UNAVAILABLE');
    return {
      fee: parsed.data.data.total_fee,
      estimatedDeliveryAt: parsed.data.data.expected_delivery_time
        ? new Date(parsed.data.data.expected_delivery_time).toISOString()
        : null,
    };
  }
}
