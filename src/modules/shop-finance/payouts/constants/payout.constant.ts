import { SHOP_LEDGER_TYPE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';

export const PAYOUT_SOURCE_KIND = {
  SETTLEMENT: 'SETTLEMENT',
} as const;

export const SHOP_LEDGER_ENTRY_TYPE = {
  ...SHOP_LEDGER_TYPE,
  COD_SHIPPING_DEBIT: 'COD_SHIPPING_DEBIT',
} as const;

export const PAYOUT_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
} as const;

export const ACTIVE_PAYOUT_STATUSES = [
  PAYOUT_STATUS.PENDING,
  PAYOUT_STATUS.PROCESSING,
] as const;

export const PAYOUT_POLICY = {
  SLA_BUSINESS_DAYS: 2,
} as const;
