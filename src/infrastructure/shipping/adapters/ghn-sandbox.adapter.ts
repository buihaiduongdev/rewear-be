import { Injectable } from '@nestjs/common';

import z from 'zod';

import { GHN_TIMEOUT_MS } from '../constants/ghn-shipment.constant';
import { GHN_SHIPPING_LIMITS } from '../constants/ghn-shipment.constant';

export type CarrierAddress = {
  name: string;
  phone: string;
  addressLine1: string;
  countryCode: string;
  provinceId: number;
  provinceName: string;
  districtId: number;
  districtName: string;
  wardCode: string;
  wardName: string;
};

export type CarrierQuoteInput = {
  ghnShopId?: number;
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

const previewSchema = z.object({
  code: z.literal(200),
  data: z.object({
    order_code: z.string().default(''),
    total_fee: z.number().int().nonnegative().max(2147483647),
    expected_delivery_time: z.string().datetime({ offset: true }).nullish(),
  }),
});

@Injectable()
export class GhnSandboxAdapter {
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

  private async request(
    path: string,
    signal: AbortSignal,
    body?: unknown,
    ghnShopId?: number,
  ) {
    const { token, shop } = this.config();
    try {
      const response = await fetch(`${origin}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Token: token,
          ShopId: String(ghnShopId ?? shop),
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(GHN_TIMEOUT_MS.CATALOG),
        ]),
      });
      if (!response.ok) throw new Error('CARRIER_REJECTED');
      const json = await response.json();
      if (json?.code !== 200) throw new Error('CARRIER_REJECTED');
      return json as { code: number; data: unknown };
    } catch (error) {
      if (error instanceof Error && error.message === 'CARRIER_REJECTED')
        throw error;
      throw new Error('CARRIER_UNAVAILABLE');
    }
  }

  async buildPayload(
    input: CarrierQuoteInput,
    _signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    this.config();
    if (
      !Number.isSafeInteger(input.value) ||
      input.value < 0 ||
      input.value > GHN_SHIPPING_LIMITS.MAX_DECLARED_VALUE
    )
      throw new Error('DECLARED_VALUE_LIMIT');

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
      from_district_id: input.from.districtId,
      from_ward_code: input.from.wardCode,
      to_name: input.to.name,
      to_phone: input.to.phone,
      to_address: input.to.addressLine1,
      to_district_id: input.to.districtId,
      to_ward_code: input.to.wardCode,
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
    return payload;
  }

  async quote(
    input: CarrierQuoteInput,
    signal: AbortSignal,
  ): Promise<{ fee: number; estimatedDeliveryAt: string | null }> {
    const payload = await this.buildPayload(input, signal);
    const parsed = previewSchema.safeParse(
      await this.request(
        '/v2/shipping-order/preview',
        signal,
        payload,
        input.ghnShopId,
      ),
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
