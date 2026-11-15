import type z from 'zod';

import type { carrierIncidentDecisionSchema } from './schemas/carrier-incident.schema';
import type { fulfillmentListSchema } from './schemas/fulfillment-list.schema';
import type { returnInspectionSchema } from './schemas/return-inspection.schema';
import type {
  cancellationDecisionSchema,
  shipmentCreateSchema,
} from './schemas/shipment.schema';
import type {
  CARRIER_INCIDENT_OUTCOME,
  CARRIER_INCIDENT_STATE,
  RETURN_INSPECTION_CONDITION,
  SHIPMENT_REVIEW_REASON,
  SHIPMENT_STATE,
} from './shipment.constants';

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
export type ShipmentCreateInput = z.output<typeof shipmentCreateSchema>;
export type CancellationDecision = z.output<typeof cancellationDecisionSchema>;
export type ReturnInspectionInput = z.output<typeof returnInspectionSchema>;
export type CarrierIncidentDecision = z.output<
  typeof carrierIncidentDecisionSchema
>;

export interface CarrierIncidentAudit {
  outcome: CarrierIncidentOutcome;
  actorId: string;
  at: string;
  reason: string;
  evidence: string;
}

export type FulfillmentListInput = z.output<typeof fulfillmentListSchema>;
