import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { trimmedTextSchema } from '@/common/schemas/request.schema';
import { ghnParcelSchema } from '@/infrastructure/shipping/ghn-shipment.schema';
import { orderSchema } from '@/modules/order/order.schema';

import { SHIPMENT_STATE } from '../shipment.constants';

export const shipmentCreateSchema = z.strictObject({
  parcel: ghnParcelSchema.strict().optional(),
});
export const cancellationDecisionSchema = z.strictObject({
  approve: z.boolean(),
  reason: trimmedTextSchema.min(1).max(1000),
  evidence: trimmedTextSchema.min(1).max(2000),
});
export const shipmentViewSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  state: z.enum(SHIPMENT_STATE),
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
  returnRequestedAt: dateTimeSchema.nullable(),
  returnInspectionBy: dateTimeSchema.nullable(),
  returnInspectionCalendarMissing: z.boolean(),
  returnInspectionOverdue: z.boolean(),
  parcel: shipmentCreateSchema.shape.parcel.unwrap(),
  quotedParcel: shipmentCreateSchema.shape.parcel.unwrap(),
});
export const labelViewSchema = z.object({ url: z.url() });
export const fulfillmentIncidentsSchema = z.object({
  shipments: z.array(shipmentViewSchema),
  orders: z.array(orderSchema),
});

export type {
  ShipmentCreateInput,
  CancellationDecision,
} from '../shipment.type';
