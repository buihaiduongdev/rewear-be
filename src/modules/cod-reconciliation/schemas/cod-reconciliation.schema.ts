import z from 'zod';

import { BASIS_POINTS_SCALE } from '@/common/constants/money.constant';
import { dateTimeSchema } from '@/common/schemas';
import { vndAmountSchema } from '@/common/schemas/money.schema';
import { trimmedTextSchema } from '@/common/schemas/request.schema';
import type { Order } from '@/modules/order/entities';
import type { Shipment } from '@/modules/shipment/entities/shipment.entity';

import {
  COD_RECONCILIATION_STATUS,
  RECONCILIATION_MODE,
  RECONCILIATION_REVIEW_REASON,
  SHOP_LEDGER_TYPE,
} from '../constants/cod-reconciliation.constant';
import type { CodCollection } from '../entities';

export type ReconciliationMode =
  (typeof RECONCILIATION_MODE)[keyof typeof RECONCILIATION_MODE];
export type CodReconciliationStatus =
  (typeof COD_RECONCILIATION_STATUS)[keyof typeof COD_RECONCILIATION_STATUS];
export type ReconciliationReviewReason =
  (typeof RECONCILIATION_REVIEW_REASON)[keyof typeof RECONCILIATION_REVIEW_REASON];
export type ShopLedgerType =
  (typeof SHOP_LEDGER_TYPE)[keyof typeof SHOP_LEDGER_TYPE];

export const vndSchema = vndAmountSchema;
const normalizedUuidSchema = z.uuid().transform((value) => value.toLowerCase());
const instantSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const proofSchema = {
  reason: trimmedTextSchema.min(1).max(1000),
  evidence: trimmedTextSchema.min(1).max(4000),
};

export const reconciliationMoneySchema = z
  .object({
    subtotal: vndSchema,
    shippingFee: vndSchema,
    total: vndSchema,
    coinDiscount: vndSchema.default(0),
    commissionBasisPoints: z.number().int().min(0).max(BASIS_POINTS_SCALE),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          price: vndSchema,
          coinDiscount: vndSchema.default(0),
        }),
      )
      .max(100),
  })
  .refine(
    (order) =>
      order.subtotal + order.shippingFee === order.total + order.coinDiscount &&
      order.coinDiscount <= Math.ceil(order.subtotal / 10) &&
      order.items.every((item) => item.coinDiscount <= item.price) &&
      order.items.reduce((sum, item) => sum + item.coinDiscount, 0) ===
        order.coinDiscount &&
      order.items.reduce((sum, item) => sum + item.price, 0) ===
        order.subtotal &&
      new Set(order.items.map((item) => item.productId)).size ===
        order.items.length,
  );

export const collectionInputSchema = z.strictObject({
  mode: z.enum(RECONCILIATION_MODE),
  waybillCode: trimmedTextSchema.min(1).max(50),
  collectedAmount: vndSchema,
  approvedCarrierFee: vndSchema,
  collectedAt: instantSchema,
  ...proofSchema,
});

export const remittanceInputSchema = z
  .strictObject({
    mode: z.enum(RECONCILIATION_MODE),
    reference: trimmedTextSchema
      .min(1)
      .max(120)
      .transform((value) => value.toUpperCase()),
    netAmount: vndSchema,
    receivedAt: instantSchema,
    ...proofSchema,
    allocations: z
      .array(
        z
          .strictObject({
            orderId: normalizedUuidSchema,
            cashAmount: vndSchema,
            feeDeducted: vndSchema,
          })
          .refine(
            (item) => item.cashAmount + item.feeDeducted > 0,
            'Allocation must carry value',
          ),
      )
      .min(1)
      .max(100),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.allocations.map((item) => item.orderId)).size !==
      value.allocations.length
    )
      ctx.addIssue({
        code: 'custom',
        message: 'An order can appear only once in a remittance',
        path: ['allocations'],
      });
    if (
      value.allocations.reduce((sum, item) => sum + item.cashAmount, 0) !==
      value.netAmount
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Net amount must equal allocated cash',
        path: ['netAmount'],
      });
  })
  .transform((value) => ({
    ...value,
    allocations: [...value.allocations].sort((a, b) =>
      a.orderId.localeCompare(b.orderId),
    ),
  }));

export const financeListSchema = z.strictObject({
  mode: z.enum(RECONCILIATION_MODE).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});
export const financeHistorySchema = financeListSchema.pick({ offset: true });

export const collectionViewSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  shopId: z.uuid(),
  shipmentId: z.uuid(),
  mode: z.enum(RECONCILIATION_MODE),
  status: z.enum(COD_RECONCILIATION_STATUS),
  expectedAmount: vndSchema,
  collectedAmount: vndSchema,
  approvedCarrierFee: vndSchema,
  gross: vndSchema,
  commission: vndSchema,
  sellerNet: vndSchema,
  cashReceived: vndSchema,
  feeDeducted: vndSchema,
  collectedAt: dateTimeSchema,
  reviewReason: z.string().nullable(),
  fundedAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
});

export const adminCollectionViewSchema = collectionViewSchema.extend({
  waybillCode: z.string(),
  actorId: z.uuid(),
  reason: z.string(),
  evidence: z.string(),
});

export const allocationViewSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  remittanceId: z.uuid(),
  cashAmount: vndSchema,
  feeDeducted: vndSchema,
});

export const remittanceViewSchema = z.object({
  id: z.uuid(),
  mode: z.enum(RECONCILIATION_MODE),
  reference: z.string(),
  netAmount: vndSchema,
  receivedAt: dateTimeSchema,
  actorId: z.uuid(),
  reason: z.string(),
  evidence: z.string(),
  allocations: z.array(allocationViewSchema),
});

export const adminReconciliationDetailSchema = z.object({
  collection: adminCollectionViewSchema,
  remittances: z.array(remittanceViewSchema),
});

export type CollectionInput = z.output<typeof collectionInputSchema>;
export type RemittanceInput = z.output<typeof remittanceInputSchema>;
export type FinanceListInput = z.output<typeof financeListSchema>;

export type CollectionContext = { order: Order; shipment: Shipment };
export type RemittanceAllocationInput = RemittanceInput['allocations'][number];
export type ValidatedRemittanceAllocation = {
  collection: CodCollection;
  allocation: RemittanceAllocationInput;
};
