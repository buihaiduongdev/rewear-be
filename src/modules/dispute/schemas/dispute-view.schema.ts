import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';

import {
  DISPUTE_ACTION,
  DISPUTE_CASE_STATE,
  DISPUTE_EVIDENCE_STATE,
  DISPUTE_ISSUE_STATE,
  DISPUTE_KIND,
  DISPUTE_PARTY,
} from '../constants/dispute.constant';
import { disputeDecisionViewSchema } from './dispute-decision-view.schema';

export const disputeIssueViewSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  productId: z.uuid(),
  kind: z.enum(DISPUTE_KIND),
  description: z.string(),
  status: z.enum(DISPUTE_ISSUE_STATE),
  supplementBy: dateTimeSchema,
  validAt: dateTimeSchema.nullable(),
  sellerNotifiedAt: dateTimeSchema.nullable(),
  sellerRespondBy: dateTimeSchema.nullable(),
  reviewDueAt: dateTimeSchema.nullable(),
  maxReviewDueAt: dateTimeSchema.nullable(),
  extendedAt: dateTimeSchema.nullable(),
  extensionReason: z.string().nullable(),
  calendarMissing: z.boolean(),
  reviewOverdue: z.boolean(),
  sellerResponseOverdue: z.boolean(),
  escalatedAt: dateTimeSchema.nullable(),
  escalationDueAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
});
export const disputeEvidenceViewSchema = z.object({
  id: z.uuid(),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  tags: z.array(z.string()),
  status: z.enum(DISPUTE_EVIDENCE_STATE),
  readyAt: dateTimeSchema.nullable(),
});
export const disputeMessageViewSchema = z.object({
  id: z.uuid(),
  issueId: z.uuid(),
  actorId: z.uuid(),
  party: z.enum(DISPUTE_PARTY),
  text: z.string(),
  evidenceIds: z.array(z.uuid()),
  late: z.boolean().nullable(),
  createdAt: dateTimeSchema,
});
export const disputeCaseViewSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  buyerId: z.uuid(),
  shopId: z.uuid(),
  state: z.enum(DISPUTE_CASE_STATE),
  createdAt: dateTimeSchema,
  issues: z.array(disputeIssueViewSchema),
});
export const disputeCaseDetailSchema = disputeCaseViewSchema.extend({
  decisions: z.array(disputeDecisionViewSchema),
  messages: z.array(disputeMessageViewSchema),
  evidence: z.array(disputeEvidenceViewSchema),
  attachments: z.array(z.object({ issueId: z.uuid(), evidenceId: z.uuid() })),
  notices: z.array(
    z.object({
      id: z.uuid(),
      issueId: z.uuid(),
      action: z.enum(DISPUTE_ACTION),
      reason: z.string(),
      createdAt: dateTimeSchema,
    }),
  ),
});
export const disputeUploadTicketSchema = z.object({
  id: z.uuid(),
  uploadUrl: z.url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresAt: dateTimeSchema,
});
export const disputeDownloadSchema = z.object({
  url: z.url(),
  headers: z.record(z.string(), z.string()),
  expiresAt: dateTimeSchema,
});
