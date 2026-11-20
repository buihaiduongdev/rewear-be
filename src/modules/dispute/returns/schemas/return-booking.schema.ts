import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { ghnParcelSchema } from '@/infrastructure/shipping/schemas/ghn-shipment.schema';

export const returnBookingInputSchema = z.strictObject({
  requestId: z.uuid(),
  parcel: ghnParcelSchema,
});
export const returnBookingViewSchema = z.object({
  id: z.uuid(),
  returnId: z.uuid(),
  state: z.string(),
  mode: z.literal('SIMULATION'),
  orderCode: z.string().nullable(),
  observedStatus: z.string().nullable(),
  observedAt: dateTimeSchema.nullable(),
  reviewRequired: z.boolean(),
});
export type ReturnBookingInput = z.output<typeof returnBookingInputSchema>;
