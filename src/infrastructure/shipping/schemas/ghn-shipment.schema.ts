import z from 'zod';

import { MAX_VND_AMOUNT } from '@/common/constants/money.constant';

import { GHN_SHIPPING_LIMITS } from '../constants/ghn-shipment.constant';

const money = z.number().int().nonnegative();
const ghnWeightSchema = z
  .number()
  .int()
  .positive()
  .max(GHN_SHIPPING_LIMITS.MAX_WEIGHT_GRAMS);
const ghnDimensionSchema = z
  .number()
  .int()
  .positive()
  .max(GHN_SHIPPING_LIMITS.MAX_DIMENSION_CM);
export const ghnParcelSchema = z.object({
  weightGrams: ghnWeightSchema,
  lengthCm: ghnDimensionSchema,
  widthCm: ghnDimensionSchema,
  heightCm: ghnDimensionSchema,
});
export const clientCodeSchema = z.string().uuid().max(50);
export const orderCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{1,50}$/);
const date = z.string().datetime({ offset: true });
export const bookingInputSchema = z.object({
  value: money.max(GHN_SHIPPING_LIMITS.MAX_DECLARED_VALUE),
  parcel: ghnParcelSchema,
});
export const shipmentPayloadSchema = z
  .object({
    client_order_code: clientCodeSchema,
    payment_type_id: z.literal(1),
    cod_amount: money.max(GHN_SHIPPING_LIMITS.MAX_COD_AMOUNT),
    cod_failed_amount: z.literal(0),
    insurance_value: money.max(GHN_SHIPPING_LIMITS.MAX_DECLARED_VALUE),
    order_value: money.max(GHN_SHIPPING_LIMITS.MAX_DECLARED_VALUE),
    weight: z
      .number()
      .int()
      .positive()
      .max(GHN_SHIPPING_LIMITS.MAX_WEIGHT_GRAMS),
    length: z
      .number()
      .int()
      .positive()
      .max(GHN_SHIPPING_LIMITS.MAX_DIMENSION_CM),
    width: z
      .number()
      .int()
      .positive()
      .max(GHN_SHIPPING_LIMITS.MAX_DIMENSION_CM),
    height: z
      .number()
      .int()
      .positive()
      .max(GHN_SHIPPING_LIMITS.MAX_DIMENSION_CM),
  })
  .passthrough();
export const createSchema = z.object({
  order_code: orderCodeSchema,
  total_fee: money.max(MAX_VND_AMOUNT),
  expected_delivery_time: date.nullish(),
});
export const detailSchema = z.object({
  order_code: orderCodeSchema,
  client_order_code: clientCodeSchema,
  shop_id: z.number().int().positive(),
  status: z.string().regex(/^[a-z_]{1,64}$/),
  updated_date: date,
  cod_amount: money.max(GHN_SHIPPING_LIMITS.MAX_COD_AMOUNT),
  payment_type_id: z.literal(1),
  is_cod_collected: z.boolean(),
  is_cod_transferred: z.boolean(),
  cod_collect_date: date.nullable(),
  cod_transfer_date: date.nullable(),
});
export const cancelSchema = z
  .array(z.object({ order_code: orderCodeSchema, result: z.boolean() }))
  .length(1);
export const printSchema = z.object({ token: z.string().min(1).max(256) });
