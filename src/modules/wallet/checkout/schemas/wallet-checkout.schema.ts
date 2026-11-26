import { z } from 'zod';

import { MAX_VND_AMOUNT } from '@/common/constants/money.constant';
import { dateTimeSchema } from '@/common/schemas';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';

import { WALLET_HOLD_STATE } from '../constants/wallet-checkout.constant';

export type WalletHoldState =
  (typeof WALLET_HOLD_STATE)[keyof typeof WALLET_HOLD_STATE];

export const reserveWalletCheckoutSchema = z.object({
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
