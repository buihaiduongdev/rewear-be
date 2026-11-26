import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { trimmedTextSchema } from '@/common/schemas/request.schema';
import { ghnParcelSchema } from '@/infrastructure/shipping/schemas/ghn-shipment.schema';

import {
  SHIPMENT_REVIEW_REASON,
  SHIPMENT_STATE,
} from '../constants/shipment.constant';

export type ShipmentState =
  (typeof SHIPMENT_STATE)[keyof typeof SHIPMENT_STATE];
export type ShipmentReviewReason =
  (typeof SHIPMENT_REVIEW_REASON)[keyof typeof SHIPMENT_REVIEW_REASON];

export const shipmentCreateSchema = z.strictObject({
  parcel: ghnParcelSchema.strict().optional(),
});
export type ShipmentCreateInput = z.infer<typeof shipmentCreateSchema>;

export const ghnWebhookSchema = z.object({
  OrderCode: trimmedTextSchema.min(1).max(50),
  ClientOrderCode: z.uuid().optional(),
  Status: trimmedTextSchema.min(1).max(64),
});
export type GhnWebhookInput = z.infer<typeof ghnWebhookSchema>;

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
  parcel: shipmentCreateSchema.shape.parcel.unwrap(),
  quotedParcel: shipmentCreateSchema.shape.parcel.unwrap(),
});

export const labelViewSchema = z.object({ url: z.url() });
