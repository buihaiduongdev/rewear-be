import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';

import { PAYOUT_SOURCE_KIND } from '../../constants/payout-source.constant';
import { PAYOUT_STATUS } from '../constants/payout.constant';

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
