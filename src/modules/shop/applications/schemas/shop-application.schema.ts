import z from 'zod';

import { dateTimeSchema } from '@/common/schemas/date-time.schema';

import {
  IDENTITY_DOCUMENT_SLOT,
  IDENTITY_DOCUMENT_TYPE,
  IDENTITY_IMAGE_MIME,
  SHOP_APPLICATION_POLICY,
  SHOP_APPLICATION_STATE,
} from '../constants/shop-application.constant';

export const applicantIdentitySchema = z
  .strictObject({
    documentType: z.enum(IDENTITY_DOCUMENT_TYPE),
    documentNumber: z.string().trim().toUpperCase().min(6).max(20),
    issuingCountry: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .default('VN'),
    fullName: z.string().trim().min(2).max(200),
    birthDate: z.iso.date(),
    expiresOn: z.iso.date(),
  })
  .superRefine((data, context) => {
    const valid =
      data.documentType === IDENTITY_DOCUMENT_TYPE.NATIONAL_ID
        ? /^\d{12}$/.test(data.documentNumber) && data.issuingCountry === 'VN'
        : /^[A-Z0-9]{6,20}$/.test(data.documentNumber);
    if (!valid)
      context.addIssue({
        code: 'custom',
        path: ['documentNumber'],
        message: 'Invalid identity document format',
      });
  });
export const applicationCreateSchema = z.strictObject({ requestId: z.uuid() });
export const applicationSubmitSchema = z.strictObject({
  requestId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  identity: applicantIdentitySchema,
  bankAccountId: z.uuid(),
  documentIds: z
    .array(z.uuid())
    .min(1)
    .max(SHOP_APPLICATION_POLICY.MAX_DOCUMENTS)
    .refine((ids) => new Set(ids).size === ids.length),
});
export const applicationDecisionSchema = z
  .strictObject({
    requestId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    outcome: z.enum([
      SHOP_APPLICATION_STATE.APPROVED,
      SHOP_APPLICATION_STATE.REJECTED,
      SHOP_APPLICATION_STATE.NEEDS_INFO,
    ]),
    reason: z.string().trim().min(3).max(2000),
    adminNote: z.string().trim().max(5000).default(''),
    identityCheckEvidence: z.string().trim().min(10).max(5000).optional(),
    identityMatchesApplicant: z.literal(true).optional(),
    noOtherApprovedAccount: z.literal(true).optional(),
  })
  .superRefine((data, context) => {
    if (
      data.outcome === SHOP_APPLICATION_STATE.APPROVED &&
      (!data.identityCheckEvidence ||
        !data.identityMatchesApplicant ||
        !data.noOtherApprovedAccount)
    )
      context.addIssue({
        code: 'custom',
        message:
          'Approval requires recorded identity and duplicate-account review',
      });
  });
export const applicationUploadSchema = z.strictObject({
  slot: z.enum(IDENTITY_DOCUMENT_SLOT),
  mimeType: z.enum(IDENTITY_IMAGE_MIME),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(SHOP_APPLICATION_POLICY.MAX_IMAGE_BYTES),
});
export const applicationQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  state: z.enum(SHOP_APPLICATION_STATE).optional(),
});
export const applicationSummarySchema = z.object({
  id: z.uuid(),
  shopId: z.uuid(),
  state: z.enum(SHOP_APPLICATION_STATE),
  version: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  submittedAt: dateTimeSchema.nullable(),
  reason: z.string().nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
const documentView = z.object({
  id: z.uuid(),
  slot: z.enum(IDENTITY_DOCUMENT_SLOT),
  mimeType: z.enum(IDENTITY_IMAGE_MIME),
  sizeBytes: z.number().int().positive(),
  ready: z.boolean(),
});
const snapshotView = z.object({
  identity: applicantIdentitySchema,
  shop: z.object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    logoUrl: z.string(),
  }),
  pickup: z.object({
    id: z.uuid(),
    contactName: z.string(),
    phone: z.string(),
    addressLine1: z.string(),
    countryCode: z.string(),
    provinceId: z.number().int().positive(),
    districtId: z.number().int().positive(),
    districtName: z.string(),
    provinceName: z.string(),
    wardCode: z.string(),
    wardName: z.string(),
  }),
  bank: z.object({
    id: z.uuid(),
    bankCode: z.string(),
    accountNumber: z.string(),
    accountName: z.string(),
    confirmedBy: z.uuid(),
  }),
  documents: z.array(
    z.object({ id: z.uuid(), slot: z.enum(IDENTITY_DOCUMENT_SLOT) }),
  ),
});
const auditView = z.object({
  action: z.string(),
  version: z.number().int(),
  revision: z.number().int(),
  reason: z.string().nullable(),
  createdAt: dateTimeSchema,
});
export const applicationViewSchema = applicationSummarySchema.extend({
  snapshot: snapshotView.nullable(),
  documents: z.array(documentView),
  history: z.array(auditView),
});
export const adminApplicationViewSchema = applicationViewSchema.extend({
  applicantId: z.uuid(),
  adminNote: z.string().nullable(),
  audits: z.array(
    auditView.extend({
      actorId: z.uuid(),
      adminNote: z.string().nullable(),
      identityCheckEvidence: z.string().nullable(),
    }),
  ),
  revisions: z.array(
    z.object({ revision: z.number().int(), snapshot: snapshotView }),
  ),
  identityMatches: z.array(
    z.object({ identityId: z.uuid(), ownerId: z.uuid() }),
  ),
});
export const applicationPageSchema = z.object({
  items: z.array(applicationSummarySchema),
  totalCount: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export const applicationUploadViewSchema = z.object({
  id: z.uuid(),
  uploadUrl: z.url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresAt: dateTimeSchema,
});
export const applicationDocumentViewSchema = documentView;
export const applicationDownloadViewSchema = z.object({
  url: z.url(),
  headers: z.record(z.string(), z.string()),
  expiresAt: dateTimeSchema,
});
