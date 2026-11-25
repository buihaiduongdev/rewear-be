import z from 'zod';

import {
  MAX_VND_AMOUNT,
  MONEY_CURRENCY,
} from '@/common/constants/money.constant';
import { dateTimeSchema } from '@/common/schemas';
import {
  safeBalanceSchema,
  vndAmountSchema,
} from '@/common/schemas/money.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { refundCreditViewSchema } from '@/modules/dispute/schemas/refund-execution.schema';

import {
  WALLET_CREDIT_REASON,
  WALLET_HOLD_STATE,
} from '../constants/wallet.constant';

export type WalletCreditReason =
  (typeof WALLET_CREDIT_REASON)[keyof typeof WALLET_CREDIT_REASON];
export type WalletHoldState =
  (typeof WALLET_HOLD_STATE)[keyof typeof WALLET_HOLD_STATE];

export const walletBalanceSchema = safeBalanceSchema;

export const orderRefundSchema = z
  .object({
    subtotal: vndAmountSchema,
    shippingFee: vndAmountSchema,
    total: vndAmountSchema,
    coinDiscount: vndAmountSchema.default(0),
  })
  .refine(
    (order) =>
      order.total + order.coinDiscount === order.subtotal + order.shippingFee &&
      order.coinDiscount <= Math.ceil(order.subtotal / 10) &&
      vndAmountSchema.safeParse(order.subtotal + order.shippingFee).success,
    {
      path: ['total'],
      message: 'Order cash and coins must match gross goods plus shipping',
    },
  );

export const walletQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});
export type WalletQueryInput = z.infer<typeof walletQuerySchema>;

export const walletViewSchema = z.object({
  balance: walletBalanceSchema,
  simulationBalance: walletBalanceSchema,
  heldBalance: walletBalanceSchema,
  simulationHeldBalance: walletBalanceSchema,
  disputeRefunds: z.array(refundCreditViewSchema),
  currency: z.literal(MONEY_CURRENCY.VND),
  credits: z.array(
    z.object({
      id: z.uuid(),
      orderId: z.uuid(),
      amount: vndAmountSchema.positive(),
      reason: z.enum(WALLET_CREDIT_REASON),
      mode: z.enum(RECONCILIATION_MODE).nullable(),
      createdAt: dateTimeSchema,
    }),
  ),
});

export const reserveWalletCheckoutSchema = z.strictObject({
  requestId: z.uuid(),
  expectedTotal: z.number().int().positive().max(MAX_VND_AMOUNT),
  mode: z.enum(RECONCILIATION_MODE).default(RECONCILIATION_MODE.EVIDENCE),
});
export type ReserveWalletCheckoutInput = z.infer<
  typeof reserveWalletCheckoutSchema
>;

export const walletCheckoutViewSchema = z.object({
  id: z.uuid(),
  checkoutId: z.uuid(),
  requestId: z.uuid(),
  amount: z.number().int().positive(),
  mode: z.enum(RECONCILIATION_MODE),
  state: z.enum(WALLET_HOLD_STATE),
  expiresAt: dateTimeSchema,
  capturedAt: dateTimeSchema.nullable(),
  releasedAt: dateTimeSchema.nullable(),
});
