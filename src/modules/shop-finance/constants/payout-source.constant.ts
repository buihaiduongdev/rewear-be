import { SHOP_LEDGER_TYPE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';

export const PAYOUT_SOURCE_KIND = {
  SETTLEMENT: 'SETTLEMENT',
} as const;

export const SHOP_LEDGER_ENTRY_TYPE = {
  ...SHOP_LEDGER_TYPE,
  COD_SHIPPING_DEBIT: 'COD_SHIPPING_DEBIT',
} as const;
