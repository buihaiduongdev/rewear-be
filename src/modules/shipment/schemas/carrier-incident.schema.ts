import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { trimmedTextSchema } from '@/common/schemas/request.schema';

export const carrierIncidentDecisionSchema = z.strictObject({
  outcome: z.enum(['CANCELLED_BEFORE_PICKUP', 'KEEP_REVIEW']),
  reason: trimmedTextSchema.min(1).max(2000),
  evidence: trimmedTextSchema.min(1).max(4000),
});
export type CarrierIncidentDecision = z.output<
  typeof carrierIncidentDecisionSchema
>;

export const carrierIncidentSchema = z.object({
  id: z.uuid(),
  shipmentId: z.uuid(),
  state: z.enum(['REVIEW', 'RESOLVED']),
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
