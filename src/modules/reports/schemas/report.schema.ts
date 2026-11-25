import z from 'zod';

import { dateTimeSchema } from '@/common/schemas/date-time.schema';

import {
  REPORT_ACTION,
  REPORT_MEASURE,
  REPORT_MIME_TYPES,
  REPORT_OUTCOME,
  REPORT_POLICY,
  REPORT_REASON,
  REPORT_STATUS,
  REPORT_TARGET,
} from '../constants/report.constant';

const evidenceIds = z
  .array(z.uuid())
  .max(REPORT_POLICY.MAX_EVIDENCE)
  .default([])
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'Duplicate report evidence',
  );
export const createReportSchema = z.strictObject({
  requestId: z.uuid(),
  targetType: z.enum(REPORT_TARGET),
  targetId: z.uuid(),
  reason: z.enum(REPORT_REASON),
  description: z.string().trim().min(10).max(REPORT_POLICY.DESCRIPTION_LENGTH),
  evidenceIds,
});
export const reportQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(REPORT_POLICY.MAX_PAGE_SIZE)
    .default(REPORT_POLICY.DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(REPORT_STATUS).optional(),
  targetType: z.enum(REPORT_TARGET).optional(),
});
export const reportSupplementSchema = z.strictObject({
  requestId: z.uuid(),
  text: z.string().trim().min(3).max(REPORT_POLICY.DESCRIPTION_LENGTH),
  evidenceIds,
});
export const claimReportSchema = z.strictObject({
  requestId: z.uuid(),
  expectedVersion: z.number().int().positive(),
});
export const resolveReportSchema = claimReportSchema
  .extend({
    outcome: z.enum(REPORT_OUTCOME),
    action: z.enum(REPORT_MEASURE),
    reason: z.string().trim().min(3).max(REPORT_POLICY.REASON_LENGTH),
    adminNote: z
      .string()
      .trim()
      .max(REPORT_POLICY.ADMIN_NOTE_LENGTH)
      .default(''),
    expectedTargetVersion: z.number().int().positive().optional(),
  })
  .superRefine((input, ctx) => {
    if (
      input.outcome === REPORT_OUTCOME.DISMISSED &&
      input.action !== REPORT_MEASURE.NONE
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Dismissed reports cannot apply a moderation measure',
      });
    if (
      input.action === REPORT_MEASURE.SUSPEND_PRODUCT &&
      input.expectedTargetVersion === undefined
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Current product moderation version is required',
      });
  });
export const reportUploadSchema = z.strictObject({
  targetType: z.enum(REPORT_TARGET),
  targetId: z.uuid(),
  reportId: z.uuid().optional(),
  mediaId: z.uuid(),
});
export const reportEvidenceViewSchema = z.object({
  id: z.uuid(),
  mimeType: z.enum(REPORT_MIME_TYPES),
  sizeBytes: z.number().int(),
});
const reportTargetSchema = z.object({
  type: z.enum(REPORT_TARGET),
  id: z.uuid(),
  shopId: z.uuid(),
  label: z.string(),
  contextOrderId: z.uuid().nullable(),
});
const reportHistorySchema = z.object({
  action: z.enum(REPORT_ACTION),
  version: z.number().int(),
  status: z.enum(REPORT_STATUS),
  reason: z.string().nullable(),
  createdAt: dateTimeSchema,
});
export const reportViewSchema = z.object({
  id: z.uuid(),
  targetType: z.enum(REPORT_TARGET),
  target: reportTargetSchema,
  reason: z.enum(REPORT_REASON),
  description: z.string(),
  status: z.enum(REPORT_STATUS),
  version: z.number().int(),
  evidence: z.array(reportEvidenceViewSchema),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  resolution: z
    .object({
      outcome: z.enum(REPORT_OUTCOME),
      action: z.enum(REPORT_MEASURE),
      reason: z.string(),
      resolvedAt: dateTimeSchema,
    })
    .nullable(),
  history: z.array(reportHistorySchema),
});
export const adminReportViewSchema = reportViewSchema.extend({
  reporterId: z.uuid(),
  assignedAdminId: z.uuid().nullable(),
  adminNote: z.string().nullable(),
  audits: z.array(
    reportHistorySchema.extend({
      actorId: z.uuid(),
      adminNote: z.string().nullable(),
      effect: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
  targetState: z.object({
    exists: z.boolean(),
    status: z.string().nullable(),
    moderationVersion: z.number().int().nullable(),
  }),
});
export const reportSummarySchema = reportViewSchema.omit({
  history: true,
  evidence: true,
});
export const adminReportSummarySchema = reportSummarySchema.extend({
  reporterId: z.uuid(),
  assignedAdminId: z.uuid().nullable(),
});
export const reportPageSchema = z.object({
  items: z.array(reportSummarySchema),
  totalCount: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export const adminReportPageSchema = z.object({
  items: z.array(adminReportSummarySchema),
  totalCount: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export const reportDownloadSchema = z.object({
  url: z.url(),
  headers: z.record(z.string(), z.string()),
  expiresAt: dateTimeSchema,
});
