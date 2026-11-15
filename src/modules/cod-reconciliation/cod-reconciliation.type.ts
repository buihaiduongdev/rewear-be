import type z from 'zod';

import type {
  COD_RECONCILIATION_STATUS,
  RECONCILIATION_MODE,
  RECONCILIATION_REVIEW_REASON,
  SHOP_LEDGER_TYPE,
} from './cod-reconciliation.constants';
import type {
  collectionInputSchema,
  financeListSchema,
  remittanceInputSchema,
} from './schemas/cod-reconciliation.schema';

export type ReconciliationMode =
  (typeof RECONCILIATION_MODE)[keyof typeof RECONCILIATION_MODE];
export type CodReconciliationStatus =
  (typeof COD_RECONCILIATION_STATUS)[keyof typeof COD_RECONCILIATION_STATUS];
export type ReconciliationReviewReason =
  (typeof RECONCILIATION_REVIEW_REASON)[keyof typeof RECONCILIATION_REVIEW_REASON];
export type ShopLedgerType =
  (typeof SHOP_LEDGER_TYPE)[keyof typeof SHOP_LEDGER_TYPE];
export type CollectionInput = z.output<typeof collectionInputSchema>;
export type RemittanceInput = z.output<typeof remittanceInputSchema>;
export type FinanceListInput = z.output<typeof financeListSchema>;
