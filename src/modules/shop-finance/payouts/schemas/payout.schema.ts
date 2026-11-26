import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { vndAmountSchema } from '@/common/schemas/money.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import { PAYOUT_SOURCE_KIND } from '../../constants/payout-source.constant';
import { BANK_VERIFICATION, PAYOUT_STATUS } from '../constants/payout.constant';

export type PayoutStatus = (typeof PAYOUT_STATUS)[keyof typeof PAYOUT_STATUS];
export type RecipientSnapshot = {
  bankCode: string;
  accountNumber: string;
  accountName: string;
};
export type PayoutSource = {
  kind: (typeof PAYOUT_SOURCE_KIND)[keyof typeof PAYOUT_SOURCE_KIND];
  sourceId: string;
  orderId: string;
  amount: number;
  mode: ReconciliationMode;
};

const text = z.string().trim().min(1).max(2000);
export const recipientSchema = z
  .object({
    bankCode: z
      .string()
      .trim()
      .regex(/^[A-Z0-9_-]{2,40}$/),
    accountNumber: z.string().regex(/^[0-9]{4,40}$/),
    accountName: z.string().trim().min(2).max(150),
  })
  .strict();
export const bankAccountInputSchema = recipientSchema
  .extend({
    ownerConfirmed: z.literal(true),
    isDefault: z.boolean().default(false),
  })
  .strict();
export const bankReviewSchema = z
  .object({ evidence: text, riskReason: text.nullable().default(null) })
  .strict();
export const payoutRequestSchema = z
  .object({
    requestId: z.string().trim().min(1).max(100),
    mode: z.enum(RECONCILIATION_MODE).default(RECONCILIATION_MODE.EVIDENCE),
    amount: vndAmountSchema.positive(),
    bankAccountId: z.uuid(),
  })
  .strict();
export const payoutReasonSchema = z.object({ reason: text }).strict();
export const payoutStartSchema = z
  .object({ recipientCheckEvidence: text })
  .strict();
export const payoutSuccessSchema = recipientSchema
  .extend({
    amount: vndAmountSchema.positive(),
    bankReference: z.string().trim().min(1).max(200),
    transferredAt: z.iso.datetime({ offset: true }),
    evidence: text,
  })
  .strict();
export const payoutFailureSchema = z
  .object({
    reason: text,
    evidence: text,
    noDebit: z.literal(true),
    noInflight: z.literal(true),
  })
  .strict();
export type BankAccountInput = z.infer<typeof bankAccountInputSchema>;
export type PayoutRequestInput = z.infer<typeof payoutRequestSchema>;
export type PayoutSuccessInput = z.infer<typeof payoutSuccessSchema>;
export const payoutUpdateSchema = z
  .object({ reason: text, evidence: text })
  .strict();
export const bankAccountViewSchema = recipientSchema.extend({
  id: z.uuid(),
  shopId: z.uuid(),
  confirmedBy: z.uuid(),
  confirmedAt: dateTimeSchema,
  isDefault: z.boolean(),
  verificationStatus: z.enum(BANK_VERIFICATION),
  riskReason: z.string().nullable().default(null),
  deletedAt: dateTimeSchema.nullable().default(null),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export const payoutViewSchema = z.object({
  id: z.uuid(),
  shopId: z.uuid(),
  ownerId: z.uuid(),
  requestId: z.string(),
  mode: z.enum(RECONCILIATION_MODE),
  status: z.enum(PAYOUT_STATUS),
  amount: vndAmountSchema,
  bankAccountId: z.uuid(),
  recipientSnapshot: recipientSchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  dueAt: dateTimeSchema.nullable().default(null),
  followUpDueAt: dateTimeSchema.nullable().default(null),
  overdueAt: dateTimeSchema.nullable().default(null),
  followUpOverdueAt: dateTimeSchema.nullable().default(null),
  operationalUpdateAt: dateTimeSchema.nullable().default(null),
  processedAt: dateTimeSchema.nullable().default(null),
  completedAt: dateTimeSchema.nullable().default(null),
  bankReference: z.string().nullable().default(null),
  bankTransferredAt: dateTimeSchema.nullable().default(null),
  reason: z.string().nullable().default(null),
  calendarMissing: z.boolean(),
  followUpOverdue: z.boolean(),
});
export const payoutEventViewSchema = z.object({
  id: z.uuid(),
  payoutId: z.uuid(),
  shopId: z.uuid(),
  type: z.string(),
  message: z.string(),
  createdAt: dateTimeSchema,
});
export const payoutOwnerViewSchema = z.object({
  accounts: z.array(bankAccountViewSchema),
  payouts: z.array(payoutViewSchema),
  events: z.array(payoutEventViewSchema),
});
export const payoutAdminItemViewSchema = payoutViewSchema.extend({
  transferEvidence: z.string().nullable().default(null),
  recipientCheckEvidence: z.string().nullable().default(null),
});
export const payoutAdminViewSchema = z.object({
  payouts: z.array(payoutAdminItemViewSchema),
  events: z.array(
    payoutEventViewSchema.extend({ actorId: z.uuid().nullable() }),
  ),
});
