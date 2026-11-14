import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { trimmedTextSchema } from '@/common/schemas/request.schema';
import { orderSchema } from '@/modules/order/order.schema';

export const shipmentCreateSchema = z.strictObject({
  parcel: z
    .strictObject({
      weightGrams: z.number().int().positive().max(50000),
      lengthCm: z.number().int().positive().max(200),
      widthCm: z.number().int().positive().max(200),
      heightCm: z.number().int().positive().max(200),
    })
    .optional(),
});
export type ShipmentCreateInput = z.output<typeof shipmentCreateSchema>;
export const cancellationDecisionSchema = z.strictObject({
  approve: z.boolean(),
  reason: trimmedTextSchema.min(1).max(1000),
  evidence: trimmedTextSchema.min(1).max(2000),
});
export type CancellationDecision = z.output<typeof cancellationDecisionSchema>;
export const shipmentViewSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  state: z.enum([
    'CREATING',
    'UNKNOWN',
    'BOOKED',
    'CANCEL_PENDING',
    'CANCELLED',
  ]),
  orderCode: z.string().nullable(),
  codAmount: z.number().int().nonnegative(),
  carrierFee: z.number().int().nullable(),
  providerStatus: z.string().nullable(),
  providerUpdatedAt: dateTimeSchema.nullable(),
  pickedObservedAt: dateTimeSchema.nullable(),
  codCollectedAt: dateTimeSchema.nullable(),
  carrierTransferredAt: dateTimeSchema.nullable(),
  reviewReason: z.string().nullable(),
  cancelRequestedAt: dateTimeSchema.nullable(),
  parcel: shipmentCreateSchema.shape.parcel.unwrap(),
  quotedParcel: shipmentCreateSchema.shape.parcel.unwrap(),
});
export const labelViewSchema = z.object({ url: z.url() });
export const fulfillmentIncidentsSchema = z.object({
  shipments: z.array(shipmentViewSchema),
  orders: z.array(orderSchema),
});
