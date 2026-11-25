import z from 'zod';

import { dateTimeSchema } from '@/common/schemas';
import { safeBalanceSchema } from '@/common/schemas/money.schema';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import {
  collectionViewSchema,
  vndSchema,
} from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { refundCreditViewSchema } from '@/modules/dispute/schemas/refund-execution.schema';

import { SHOP_LEDGER_ENTRY_TYPE } from '../constants/payout-source.constant';
import type { PayoutSource } from '../payouts/schemas/payout.schema';

export type ShopLedgerEntryType =
  (typeof SHOP_LEDGER_ENTRY_TYPE)[keyof typeof SHOP_LEDGER_ENTRY_TYPE];

export interface PayoutSourceRow {
  kind: PayoutSource['kind'];
  sourceId: string;
  orderId: string;
  net: string;
  paid: string;
  reserved: string;
  blocked: boolean;
}

export const shopFinanceViewSchema = z.object({
  shopId: z.uuid(),
  mode: z.enum(RECONCILIATION_MODE),
  held: safeBalanceSchema,
  receivable: safeBalanceSchema,
  available: safeBalanceSchema,
  payoutLocked: safeBalanceSchema,
  paidOut: safeBalanceSchema,
  paidOutDebt: safeBalanceSchema,
  heldShortfall: safeBalanceSchema,
  reviewHeld: safeBalanceSchema,
  shippingDebit: safeBalanceSchema,
  refunds: z.array(refundCreditViewSchema),
  settlements: z.array(
    z.object({
      id: z.uuid(),
      orderId: z.uuid(),
      amount: vndSchema,
      createdAt: dateTimeSchema,
    }),
  ),
  entries: z.array(
    z.object({
      id: z.uuid(),
      orderId: z.uuid(),
      type: z.enum(SHOP_LEDGER_ENTRY_TYPE),
      amount: vndSchema,
      createdAt: dateTimeSchema,
    }),
  ),
  collections: z.array(collectionViewSchema),
});
