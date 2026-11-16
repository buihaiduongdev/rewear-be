import z from 'zod';

export const fulfillmentListSchema = z.strictObject({
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});
export type { FulfillmentListInput } from '../types/shipment.type';
