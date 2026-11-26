import { z } from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import { disputeEvidenceViewSchema } from '../../schemas/dispute-view.schema';
import {
  RETURN_EVIDENCE_KIND,
  RETURN_STATE,
} from '../constants/return.constant';

export const returnActionSchema = z
  .object({
    requestId: z.string().uuid(),
    reason: z.string().trim().min(1).max(4000),
    evidenceIds: z.array(z.string().uuid()).max(30).default([]),
    mode: z.enum(['EVIDENCE', 'SIMULATION']).optional(),
    observedAt: dateTimeSchema.optional(),
    labelCode: z.string().trim().min(1).optional(),
    reviewToken: z.string().length(64).optional(),
    conclusion: z
      .enum(['INCONCLUSIVE', 'FULL_REFUND', 'BUYER_FAULT'])
      .optional(),
    refundLimit: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ReturnActionInput = z.input<typeof returnActionSchema>;
export type ReturnActionData = Omit<
  z.output<typeof returnActionSchema>,
  'observedAt'
> & { observedAt?: Date };
export const returnViewSchema = z.object({
  labelReplacementRequired: z.boolean(),
  timelyHandoverReviewRequired: z.boolean(),
  evidence: z.array(disputeEvidenceViewSchema).default([]),
  evidenceLinks: z
    .array(z.object({ evidenceId: z.string().uuid(), kind: z.string() }))
    .default([]),
  events: z
    .array(
      z.object({
        id: z.string().uuid(),
        requestId: z.string().uuid(),
        actorId: z.string().uuid(),
        action: z.string(),
        reason: z.string(),
        createdAt: dateTimeSchema,
      }),
    )
    .default([]),
  objectionOverdueAt: dateTimeSchema.nullable(),
  id: z.string().uuid(),
  remedyKey: z.string(),
  orderId: z.string().uuid(),
  productId: z.string().uuid(),
  state: z.string(),
  mode: z.string().nullable(),
  labelCode: z.string().nullable(),
  instructions: z.string().nullable(),
  labelNotifiedAt: dateTimeSchema.nullable(),
  handoverBy: dateTimeSchema.nullable(),
  handoverAt: dateTimeSchema.nullable(),
  deliveredAt: dateTimeSchema.nullable(),
  inspectionDueAt: dateTimeSchema.nullable(),
  readyAt: dateTimeSchema.nullable(),
  refundLimit: z.number().nullable(),
  readyReason: z.string().nullable(),
  packingMissing: z.boolean(),
  calendarMissing: z.boolean(),
  obstaclePending: z.boolean(),
  objectionAt: dateTimeSchema.nullable(),
  objectionDueAt: dateTimeSchema.nullable(),
});
export const returnReviewSchema = z.object({
  returnCase: returnViewSchema,
  reviewToken: z.string(),
});

export type ReturnState = (typeof RETURN_STATE)[keyof typeof RETURN_STATE];
export type ReturnEvidenceKind =
  (typeof RETURN_EVIDENCE_KIND)[keyof typeof RETURN_EVIDENCE_KIND];
export interface ReturnGate {
  status: 'PENDING' | 'READY' | 'CLOSED';
  amount: number;
  at: Date | null;
  mode: ReconciliationMode | null;
}
