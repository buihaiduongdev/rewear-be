import type z from 'zod';

import type {
  HANDOVER_ACTION,
  HANDOVER_STATE,
  HANDOVER_STOP_REASON,
} from './late-handover.constants';
import type {
  fulfillmentCalendarSchema,
  handoverProposalSchema,
  handoverStopSchema,
} from './schemas/late-handover.schema';

export type HandoverState =
  (typeof HANDOVER_STATE)[keyof typeof HANDOVER_STATE];
export type HandoverAction =
  (typeof HANDOVER_ACTION)[keyof typeof HANDOVER_ACTION];
export type HandoverStopReason =
  (typeof HANDOVER_STOP_REASON)[keyof typeof HANDOVER_STOP_REASON];
export type HandoverProposal = z.output<typeof handoverProposalSchema>;
export type HandoverStop = z.output<typeof handoverStopSchema>;
export type CalendarInput = z.output<typeof fulfillmentCalendarSchema>;

export interface HandoverAudit {
  action: HandoverAction;
  actorId: string | null;
  at: string;
  reason: string;
  evidence?: string;
}
