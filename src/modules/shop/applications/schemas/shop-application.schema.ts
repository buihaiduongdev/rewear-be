import z from 'zod';

import { dateTimeSchema } from '@/common/schemas/date-time.schema';

import {
  IDENTITY_DOCUMENT_SLOT,
  IDENTITY_DOCUMENT_TYPE,
  IDENTITY_IMAGE_MIME,
  SHOP_APPLICATION_KIND,
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

const documentIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(SHOP_APPLICATION_POLICY.MAX_DOCUMENTS)
  .refine((ids) => new Set(ids).size === ids.length);

export const applicationSubmitSchema = z.strictObject({
  identity: applicantIdentitySchema,
  bankAccountId: z.uuid(),
  documentIds: documentIdsSchema,
});

export const submitIdentityRenewalSchema = z.strictObject({
  identity: applicantIdentitySchema,
  documentIds: documentIdsSchema,
});

export const applicationDecisionSchema = z.strictObject({
  outcome: z.enum([
    SHOP_APPLICATION_STATE.APPROVED,
    SHOP_APPLICATION_STATE.REJECTED,
    SHOP_APPLICATION_STATE.NEEDS_INFO,
  ]),
  reason: z.string().trim().min(3).max(2000),
  adminNote: z.string().trim().max(5000).default(''),
});

export const applicationUploadSchema = z.strictObject({
  slot: z.enum(IDENTITY_DOCUMENT_SLOT),
  mediaId: z.uuid(),
});

export const applicationQuerySchema = z.strictObject({
  kind: z.enum(SHOP_APPLICATION_KIND).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  state: z.enum(SHOP_APPLICATION_STATE).optional(),
});

export const applicationSummarySchema = z.object({
  id: z.uuid(),
  shopId: z.uuid(),
  kind: z.enum(SHOP_APPLICATION_KIND),
  state: z.enum(SHOP_APPLICATION_STATE),
  submittedAt: dateTimeSchema.nullable(),
  reviewedAt: dateTimeSchema.nullable(),
  reason: z.string().nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const applicationDocumentViewSchema = z.object({
  id: z.uuid(),
  slot: z.enum(IDENTITY_DOCUMENT_SLOT),
  mimeType: z.enum(IDENTITY_IMAGE_MIME),
  sizeBytes: z.number().int().positive(),
  isSelected: z.boolean(),
});

export const applicationViewSchema = applicationSummarySchema.extend({
  identity: applicantIdentitySchema.nullable(),
  shop: z.object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    logoUrl: z.string().nullable(),
  }),
  pickup: z
    .object({
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
    })
    .nullable(),
  bank: z
    .object({
      id: z.uuid(),
      bankCode: z.string(),
      accountNumber: z.string(),
      accountName: z.string(),
      confirmedBy: z.uuid(),
    })
    .nullable(),
  documents: z.array(applicationDocumentViewSchema),
});

export const adminApplicationViewSchema = applicationViewSchema.extend({
  applicantId: z.uuid(),
  reviewedById: z.uuid().nullable(),
  adminNote: z.string().nullable(),
});

export const applicationPageSchema = z.object({
  items: z.array(applicationSummarySchema),
  totalCount: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const applicationDownloadViewSchema = z.object({
  url: z.url(),
  headers: z.record(z.string(), z.string()),
  expiresAt: dateTimeSchema,
});

export type ShopApplicationKind = z.infer<
  typeof applicationSummarySchema
>['kind'];
export type ShopApplicationState = z.infer<
  typeof applicationSummarySchema
>['state'];
export type IdentityDocumentType = z.infer<
  typeof applicantIdentitySchema
>['documentType'];
export type IdentityDocumentSlot = z.infer<
  typeof applicationUploadSchema
>['slot'];
export type ApplicantIdentity = z.infer<typeof applicantIdentitySchema>;
export type ApplicationSubmitInput = z.input<typeof applicationSubmitSchema>;
export type SubmitIdentityRenewalInput = z.input<
  typeof submitIdentityRenewalSchema
>;
export type ApplicationDecisionInput = z.input<
  typeof applicationDecisionSchema
>;
export type ApplicationUploadInput = z.input<typeof applicationUploadSchema>;
export type ApplicationQueryInput = z.input<typeof applicationQuerySchema>;
