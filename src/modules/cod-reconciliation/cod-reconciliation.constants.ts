export const RECONCILIATION_MODE = {
  EVIDENCE: 'EVIDENCE',
  SIMULATION: 'SIMULATION',
} as const;
export type ReconciliationMode =
  (typeof RECONCILIATION_MODE)[keyof typeof RECONCILIATION_MODE];
export const COD_RECONCILIATION_STATUS = {
  REVIEW: 'REVIEW',
  AWAITING: 'AWAITING',
  PARTIAL: 'PARTIAL',
  FUNDED_HELD: 'FUNDED_HELD',
} as const;
export type CodReconciliationStatus =
  (typeof COD_RECONCILIATION_STATUS)[keyof typeof COD_RECONCILIATION_STATUS];
export const SHOP_LEDGER_TYPE = { COD_FUNDED_HELD: 'COD_FUNDED_HELD' } as const;
