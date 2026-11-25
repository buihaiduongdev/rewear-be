import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { trimmedTextSchema } from '@/common/schemas/request.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';

import {
  ORDER_CANCEL_STATE,
  ORDER_CANCELLATION_REASON,
  ORDER_EVENT_ACTION,
  ORDER_PAYMENT_METHOD,
  ORDER_STATUS,
  orderEventActions,
  orderStates,
} from '../constants/order.constant';

export type OrderState = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
export type OrderEventAction =
  (typeof ORDER_EVENT_ACTION)[keyof typeof ORDER_EVENT_ACTION];
export type OrderCancellationReason =
  (typeof ORDER_CANCELLATION_REASON)[keyof typeof ORDER_CANCELLATION_REASON];
export type OrderCancelState =
  (typeof ORDER_CANCEL_STATE)[keyof typeof ORDER_CANCEL_STATE];
export type OrderPaymentMethod =
  (typeof ORDER_PAYMENT_METHOD)[keyof typeof ORDER_PAYMENT_METHOD];

export { orderStates, orderEventActions };

export const orderListInputSchema = z.strictObject({
  status: z.enum(ORDER_STATUS).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});
export type OrderListInput = z.infer<typeof orderListInputSchema>;

export const rejectOrderSchema = z.strictObject({
  reason: trimmedTextSchema.min(1).max(1000),
});
export type RejectOrderInput = z.infer<typeof rejectOrderSchema>;

export const acceptOrderSchema = z.strictObject({});

export const verifyDeliverySchema = z.strictObject({
  deliveredAt: z.iso.datetime({ offset: true }),
  mode: z.enum(RECONCILIATION_MODE),
  reason: trimmedTextSchema.min(1).max(1000),
  evidence: trimmedTextSchema.min(1).max(2000),
});
export type VerifyDeliveryInput = z.output<typeof verifyDeliverySchema>;

export const orderSchema = z.object({
  coinDiscount: z.number().int().nonnegative().default(0),
  coinMode: z.enum(RECONCILIATION_MODE).nullable().default(null),
  id: z.uuid(),
  orderCode: z.string().regex(/^RW-[0-9A-F]{10}$/),
  paymentId: z.uuid().nullable(),
  walletDebitId: z.uuid().nullable(),
  paymentMethod: z.enum(ORDER_PAYMENT_METHOD),
  checkoutId: z.uuid().nullable(),
  handoverBy: dateTimeSchema.nullable(),
  handoverReviewRequired: z.boolean(),
  deliveryObservedAt: dateTimeSchema.nullable(),
  receiptConfirmedAt: dateTimeSchema.nullable(),
  deliveryVerifiedAt: dateTimeSchema.nullable(),
  disputeDeadlineAt: dateTimeSchema.nullable(),
  carrierReturnedAt: dateTimeSchema.nullable(),
  cancelState: z.enum(ORDER_CANCEL_STATE).nullable(),
  cancelRequestedAt: dateTimeSchema.nullable(),
  shopId: z.uuid(),
  shopName: z.string(),
  status: z.enum(ORDER_STATUS),
  subtotal: z.number().int(),
  shippingFee: z.number().int(),
  total: z.number().int(),
  sellerConfirmBy: dateTimeSchema,
  acceptedAt: dateTimeSchema.nullable(),
  cancelledAt: dateTimeSchema.nullable(),
  cancellationReason: z.enum(ORDER_CANCELLATION_REASON).nullable(),
  cancellationNote: z.string().nullable(),
  address: z.record(z.string(), z.unknown()),
  items: z.array(z.record(z.string(), z.unknown())),
  stockReleaseReviewIds: z.array(z.uuid()),
  walletRefund: z
    .object({
      id: z.uuid(),
      amount: z.number().int().positive(),
      creditedAt: dateTimeSchema,
    })
    .nullable()
    .optional(),
  events: z
    .array(
      z.object({
        id: z.uuid(),
        action: z.enum(ORDER_EVENT_ACTION),
        actorId: z.uuid().nullable(),
        reason: z.string().nullable(),
        createdAt: dateTimeSchema,
      }),
    )
    .optional(),
});
export const orderListSchema = z.array(orderSchema);
