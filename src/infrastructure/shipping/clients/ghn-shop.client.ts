import { Injectable } from '@nestjs/common';

import { z } from 'zod';

const GHN_STAGING = 'https://dev-online-gateway.ghn.vn/shiip/public-api';
const TIMEOUT_MS = 8000;

const responseSchema = z.object({
  code: z.number(),
  data: z.unknown().optional(),
});
const createdShopSchema = z.object({ shop_id: z.number().int().positive() });
const provinceSchema = z.object({
  ProvinceID: z.number().int().positive(),
  ProvinceName: z.string().min(1),
});
const districtSchema = z.object({
  DistrictID: z.number().int().positive(),
  DistrictName: z.string().min(1),
});
const wardSchema = z.object({
  WardCode: z.string().min(1),
  WardName: z.string().min(1),
});

export type GhnShopInput = {
  name: string;
  phone: string;
  address: string;
  districtId: number;
  wardCode: string;
};

/** Only a validated GHN response proves creation. Unknown results must not be retried blindly. */
export type GhnShopCreationResult =
  { status: 'CREATED'; shopId: number } | { status: 'UNKNOWN' };

@Injectable()
export class GhnShopClient {
  private headers(): Record<string, string> {
    const token = process.env.GHN_SANDBOX_TOKEN;
    const shopId = Number(process.env.GHN_SANDBOX_SHOP_ID);
    if (
      process.env.GHN_SANDBOX_ENABLED !== 'true' ||
      !token?.trim() ||
      !Number.isSafeInteger(shopId) ||
      shopId <= 0
    ) {
      throw new Error('GHN_NOT_CONFIGURED');
    }
    return {
      Token: token,
      ShopId: String(shopId),
      'Content-Type': 'application/json',
    };
  }

  private async catalog(path: string) {
    const response = await fetch(`${GHN_STAGING}${path}`, {
      headers: this.headers(),
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error('GHN_CATALOG_UNAVAILABLE');
    const result = responseSchema.parse(await response.json());
    if (result.code !== 200) throw new Error('GHN_CATALOG_UNAVAILABLE');
    return result.data;
  }

  async provinces() {
    const items = z
      .array(provinceSchema)
      .parse(await this.catalog('/master-data/province'));
    return items.map((item) => ({
      id: item.ProvinceID,
      name: item.ProvinceName,
    }));
  }

  async districts(provinceId: number) {
    const items = z
      .array(districtSchema)
      .nullable()
      .transform((items) => items ?? [])
      .parse(
        await this.catalog(
          `/master-data/district?province_id=${encodeURIComponent(provinceId)}`,
        ),
      );
    return items.map((item) => ({
      id: item.DistrictID,
      name: item.DistrictName,
    }));
  }

  async wards(districtId: number) {
    const items = z
      .array(wardSchema)
      .nullable()
      .transform((items) => items ?? [])
      .parse(
        await this.catalog(
          `/master-data/ward?district_id=${encodeURIComponent(districtId)}`,
        ),
      );
    return items.map((item) => ({ id: item.WardCode, name: item.WardName }));
  }

  async findOwnedShop(shopId: number) {
    const itemSchema = z.object({
      _id: z.number().int().positive(),
      name: z.string(),
      phone: z.string(),
      address: z.string(),
      district_id: z.number().int(),
      ward_code: z.string(),
      status: z.number(),
    });
    const pageSchema = z.object({
      last_offset: z.number().int().nullable().optional(),
      shops: z.array(itemSchema),
    });
    let offset = 0;
    for (let page = 0; page < 50; page++) {
      const result = pageSchema.parse(
        await this.catalog(`/v2/shop/all?offset=${offset}&limit=100`),
      );
      const match = result.shops.find((shop) => shop._id === shopId);
      if (match) return match;
      if (
        !result.shops.length ||
        !result.last_offset ||
        result.last_offset <= offset
      )
        return null;
      offset = result.last_offset;
    }
    throw new Error('GHN_SHOP_LIST_INCOMPLETE');
  }

  async create(input: GhnShopInput): Promise<GhnShopCreationResult> {
    const headers = this.headers(); // Configuration errors occur before any request is sent.
    try {
      const response = await fetch(`${GHN_STAGING}/v2/shop/register`, {
        method: 'POST',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          name: input.name,
          phone: input.phone,
          address: input.address,
          district_id: input.districtId,
          ward_code: input.wardCode,
        }),
      });
      const body: unknown = await response.json();
      const parsed = responseSchema.safeParse(body);
      if (response.ok && parsed.success && parsed.data.code === 200) {
        const result = createdShopSchema.safeParse(parsed.data.data);
        if (result.success)
          return { status: 'CREATED', shopId: result.data.shop_id };
      }
      return { status: 'UNKNOWN' };
    } catch {
      return { status: 'UNKNOWN' };
    }
  }
}
