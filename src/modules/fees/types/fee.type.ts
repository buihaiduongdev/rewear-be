import type z from 'zod';

import type {
  FEE_COLLECTION_METHOD,
  FEE_KIND,
  FEE_PARTY,
  FEE_REFUND_STATE,
  FEE_STATUS,
} from '../constants/fee.constant';
import type {
  feeAdminQueueSchema,
  feeAssessmentSchema,
  feeCorrectionSchema,
  feeObjectionSchema,
} from '../schemas/fee.schema';

export type FeeParty = (typeof FEE_PARTY)[keyof typeof FEE_PARTY];
export type FeeKind = (typeof FEE_KIND)[keyof typeof FEE_KIND];
export type FeeStatus = (typeof FEE_STATUS)[keyof typeof FEE_STATUS];
export type FeeCollectionMethod =
  (typeof FEE_COLLECTION_METHOD)[keyof typeof FEE_COLLECTION_METHOD];
export type FeeRefundState =
  (typeof FEE_REFUND_STATE)[keyof typeof FEE_REFUND_STATE];

export type FeeAssessmentInput = z.output<typeof feeAssessmentSchema>;
export type FeeObjectionInput = z.output<typeof feeObjectionSchema>;
export type FeeCorrectionInput = z.output<typeof feeCorrectionSchema>;
export type FeeAdminQueueInput = z.output<typeof feeAdminQueueSchema>;
