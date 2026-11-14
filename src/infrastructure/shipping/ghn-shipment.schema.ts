import z from 'zod';

const money = z.number().int().nonnegative();
export const clientCodeSchema = z.string().uuid().max(50);
export const orderCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{1,50}$/);
const date = z.string().datetime({ offset: true });
export const bookingInputSchema = z.object({
  value: money.max(5000000),
  parcel: z.object({
    weightGrams: z.number().int().positive().max(50000),
    lengthCm: z.number().int().positive().max(200),
    widthCm: z.number().int().positive().max(200),
    heightCm: z.number().int().positive().max(200),
  }),
});
export const shipmentPayloadSchema = z
  .object({
    client_order_code: clientCodeSchema,
    payment_type_id: z.literal(1),
    cod_amount: money.max(50000000),
    cod_failed_amount: z.literal(0),
    insurance_value: money.max(5000000),
    order_value: money.max(5000000),
    weight: z.number().int().positive().max(50000),
    length: z.number().int().positive().max(200),
    width: z.number().int().positive().max(200),
    height: z.number().int().positive().max(200),
  })
  .passthrough();
export const createSchema = z.object({
  order_code: orderCodeSchema,
  total_fee: money.max(2147483647),
  expected_delivery_time: date.nullish(),
});
export const detailSchema = z.object({
  order_code: orderCodeSchema,
  client_order_code: clientCodeSchema,
  shop_id: z.number().int().positive(),
  status: z.string().regex(/^[a-z_]{1,64}$/),
  updated_date: date,
  cod_amount: money.max(50000000),
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
