import type { PayoutSource } from '../payouts/types/payout.type';

export interface PayoutSourceRow {
  kind: PayoutSource['kind'];
  sourceId: string;
  orderId: string;
  net: string;
  paid: string;
  reserved: string;
  blocked: boolean;
}
