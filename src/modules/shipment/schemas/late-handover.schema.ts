import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { trimmedTextSchema } from '@/common/schemas/request.schema';

import { HANDOVER_ACTION } from '../constants/late-handover.constant';
import { HANDOVER_STATE } from '../constants/late-handover.constant';

export const handoverProposalSchema = z.strictObject({
  deadline: z.iso.datetime({ offset: true }),
  reason: trimmedTextSchema.min(1).max(1000),
});
export const handoverResponseSchema = z.strictObject({ accept: z.boolean() });
export const handoverStopSchema = z.strictObject({
  reason: trimmedTextSchema.min(1).max(1000),
  evidence: trimmedTextSchema.min(1).max(2000),
});
export const fulfillmentCalendarSchema = z
  .strictObject({
    year: z.number().int().min(2026).max(2100),
    closedDates: z.array(z.iso.date()).max(366),
    source: trimmedTextSchema.min(1).max(2000),
  })
  .refine(
    (value) =>
      value.closedDates.every((date) => date.startsWith(`${value.year}-`)),
    'Closure must belong to the configured year',
  );
export const fulfillmentNoticeSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  action: z.enum(HANDOVER_ACTION),
  reason: z.string(),
  createdAt: dateTimeSchema,
});
export const handoverCaseSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  state: z.enum(Object.values(HANDOVER_STATE)),
  detectedAt: dateTimeSchema,
  reviewDueAt: dateTimeSchema.nullable(),
  calendarMissing: z.boolean(),
  proposedDeadline: dateTimeSchema.nullable(),
  respondBy: dateTimeSchema.nullable(),
  consentedAt: dateTimeSchema.nullable(),
  reason: z.string().nullable(),
  events: z.array(
    z.object({
      action: z.enum(HANDOVER_ACTION),
      actorId: z.uuid().nullable(),
      at: z.iso.datetime(),
      reason: z.string(),
    }),
  ),
});

export type {
  HandoverProposal,
  HandoverStop,
  CalendarInput,
} from '../types/late-handover.type';
