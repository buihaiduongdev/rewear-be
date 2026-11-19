import type z from 'zod';

import type {
  DISPUTE_APPEAL_ELIGIBILITY,
  DISPUTE_FINAL_SOURCE,
} from '../constants/dispute.constant';
import type {
  disputeAppealConclusionSchema,
  disputeAppealInputSchema,
} from '../schemas/dispute-appeal.schema';

export type DisputeAppealEligibility =
  (typeof DISPUTE_APPEAL_ELIGIBILITY)[keyof typeof DISPUTE_APPEAL_ELIGIBILITY];
export type DisputeFinalSource =
  (typeof DISPUTE_FINAL_SOURCE)[keyof typeof DISPUTE_FINAL_SOURCE];
export type DisputeAppealInput = z.output<typeof disputeAppealInputSchema>;
export type DisputeAppealConclusionInput = z.output<
  typeof disputeAppealConclusionSchema
>;
