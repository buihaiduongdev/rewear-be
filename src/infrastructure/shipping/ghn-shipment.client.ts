import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import {
  type CarrierQuoteInput,
  GhnSandboxAdapter,
} from './ghn-sandbox.adapter';
import {
  bookingInputSchema,
  cancelSchema,
  clientCodeSchema,
  createSchema,
  detailSchema,
  orderCodeSchema,
  printSchema,
  shipmentPayloadSchema,
} from './ghn-shipment.schema';

const host = 'https://dev-online-gateway.ghn.vn';
const failure = () =>
  new ServiceUnavailableException('GHN_BOOKING_UNAVAILABLE');
const iso = (value: string | null | undefined) =>
  value ? new Date(value).toISOString() : null;
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export type GhnShipmentSnapshot = {
  orderCode: string;
  clientCode: string;
  shopId: number;
  status: string;
  updatedAt: string;
  codAmount: number;
  paymentType: 1;
  codCollected: boolean;
  codTransferred: boolean;
  collectedAt: string | null;
  transferredAt: string | null;
};
@Injectable()
export class GhnShipmentClient {
  constructor(private readonly adapter: GhnSandboxAdapter) {}
  private config() {
    const token = process.env.GHN_SANDBOX_TOKEN;
    const shop = Number(process.env.GHN_SANDBOX_SHOP_ID);
    if (
      process.env.GHN_BOOKING_ENABLED !== 'true' ||
      process.env.GHN_SANDBOX_ENABLED !== 'true' ||
      !token?.trim() ||
      !Number.isSafeInteger(shop) ||
      shop <= 0
    )
      throw failure();
    return { token, shop };
  }
  private async request(path: string, body?: unknown): Promise<unknown> {
    const { token, shop } = this.config();
    try {
      const response = await fetch(host + '/shiip/public-api' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Token: token,
          ShopId: String(shop),
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw failure();
      const json: unknown = await response.json();
      if (
        !json ||
        typeof json !== 'object' ||
        !('code' in json) ||
        json.code !== 200 ||
        !('data' in json)
      )
        throw failure();
      return json.data;
    } catch {
      throw failure();
    }
  }
  async prepare(
    input: CarrierQuoteInput,
    codAmount: number,
    clientCode: string,
  ): Promise<Readonly<Record<string, unknown>>> {
    this.config();
    try {
      bookingInputSchema.parse(input);
      const basics = {
        client_order_code: clientCodeSchema.parse(clientCode),
        payment_type_id: 1,
        cod_amount: codAmount,
        cod_failed_amount: 0,
        insurance_value: input.value,
        order_value: input.value,
        weight: input.parcel.weightGrams,
        length: input.parcel.lengthCm,
        width: input.parcel.widthCm,
        height: input.parcel.heightCm,
      };
      shipmentPayloadSchema.parse(basics);
      return freeze(
        shipmentPayloadSchema.parse({
          ...(await this.adapter.buildPayload(
            input,
            AbortSignal.timeout(8000),
          )),
          ...basics,
        }),
      );
    } catch {
      throw failure();
    }
  }
  async create(payload: Readonly<Record<string, unknown>>) {
    this.config();
    try {
      const body = shipmentPayloadSchema.parse(payload);
      const result = createSchema.parse(
        await this.request('/v2/shipping-order/create', body),
      );
      return {
        orderCode: result.order_code,
        fee: result.total_fee,
        estimatedDeliveryAt: iso(result.expected_delivery_time),
      };
    } catch {
      throw failure();
    }
  }
  async query(clientCode: string): Promise<GhnShipmentSnapshot> {
    const { shop } = this.config();
    try {
      clientCodeSchema.parse(clientCode);
      const row = detailSchema.parse(
        await this.request(
          '/v2/shipping-order/detail-by-client-code?client_order_code=' +
            encodeURIComponent(clientCode),
        ),
      );
      if (row.client_order_code !== clientCode || row.shop_id !== shop)
        throw failure();
      return {
        orderCode: row.order_code,
        clientCode: row.client_order_code,
        shopId: row.shop_id,
        status: row.status,
        updatedAt: iso(row.updated_date)!,
        codAmount: row.cod_amount,
        paymentType: row.payment_type_id,
        codCollected: row.is_cod_collected,
        codTransferred: row.is_cod_transferred,
        collectedAt: iso(row.cod_collect_date),
        transferredAt: iso(row.cod_transfer_date),
      };
    } catch {
      throw failure();
    }
  }
  async cancel(orderCode: string): Promise<boolean> {
    this.config();
    try {
      orderCodeSchema.parse(orderCode);
      const rows = cancelSchema.parse(
        await this.request('/v2/switch-status/cancel', {
          order_codes: [orderCode],
        }),
      );
      if (rows[0].order_code !== orderCode) throw failure();
      return rows[0].result;
    } catch {
      throw failure();
    }
  }
  async print(orderCode: string): Promise<{ url: string }> {
    this.config();
    try {
      orderCodeSchema.parse(orderCode);
      const row = printSchema.parse(
        await this.request('/v2/a5/gen-token', { order_codes: [orderCode] }),
      );
      return {
        url:
          host +
          '/a5/public-api/printA5?token=' +
          encodeURIComponent(row.token),
      };
    } catch {
      throw failure();
    }
  }
}
