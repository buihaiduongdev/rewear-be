import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { trimmedTextSchema } from '@/common/schemas/request.schema';

import {
  CARRIER_INCIDENT_OUTCOME,
  CARRIER_INCIDENT_STATE,
} from '../constants/shipment.constant';

export const carrierIncidentDecisionSchema = z.strictObject({
  outcome: z.enum(CARRIER_INCIDENT_OUTCOME),
  reason: trimmedTextSchema.min(1).max(2000),
  evidence: trimmedTextSchema.min(1).max(4000),
});

export const carrierIncidentSchema = z.object({
  id: z.uuid(),
  shipmentId: z.uuid(),
  state: z.enum(CARRIER_INCIDENT_STATE),
  openedAt: dateTimeSchema,
  reviewDueAt: dateTimeSchema.nullable(),
  calendarMissing: z.boolean(),
  overdue: z.boolean(),
  events: z.array(
    carrierIncidentDecisionSchema.extend({
      actorId: z.uuid(),
      at: z.iso.datetime(),
    }),
  ),
});

export type { CarrierIncidentDecision } from '../schemas/shipment.schema';
