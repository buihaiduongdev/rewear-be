import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { trimmedTextSchema } from '@/common/schemas/request.schema';
import { ghnParcelSchema } from '@/infrastructure/shipping/schemas/ghn-shipment.schema';
import { orderSchema } from '@/modules/order/schemas/order.schema';

import {
  CARRIER_INCIDENT_OUTCOME,
  CARRIER_INCIDENT_STATE,
  RETURN_INSPECTION_CONDITION,
  SHIPMENT_REVIEW_REASON,
  SHIPMENT_STATE,
} from '../constants/shipment.constant';
import type { carrierIncidentDecisionSchema } from './carrier-incident.schema';
import type { fulfillmentListSchema } from './fulfillment-list.schema';
import type { returnInspectionSchema } from './return-inspection.schema';

export type ShipmentState =
  (typeof SHIPMENT_STATE)[keyof typeof SHIPMENT_STATE];
export type ShipmentReviewReason =
  (typeof SHIPMENT_REVIEW_REASON)[keyof typeof SHIPMENT_REVIEW_REASON];
export type CarrierIncidentState =
  (typeof CARRIER_INCIDENT_STATE)[keyof typeof CARRIER_INCIDENT_STATE];
export type CarrierIncidentOutcome =
  (typeof CARRIER_INCIDENT_OUTCOME)[keyof typeof CARRIER_INCIDENT_OUTCOME];
export type ReturnInspectionCondition =
  (typeof RETURN_INSPECTION_CONDITION)[keyof typeof RETURN_INSPECTION_CONDITION];

export interface CarrierIncidentAudit {
  outcome: CarrierIncidentOutcome;
  actorId: string;
  at: string;
  reason: string;
  evidence: string;
}

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

export type ShipmentCreateInput = z.output<typeof shipmentCreateSchema>;
export type CancellationDecision = z.output<typeof cancellationDecisionSchema>;
export type ReturnInspectionInput = z.output<typeof returnInspectionSchema>;
export type CarrierIncidentDecision = z.output<
  typeof carrierIncidentDecisionSchema
>;
export type FulfillmentListInput = z.output<typeof fulfillmentListSchema>;
