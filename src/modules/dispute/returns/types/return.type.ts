import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import type {
  RETURN_EVIDENCE_KIND,
  RETURN_STATE,
} from '../constants/return.constant';

export type ReturnState = (typeof RETURN_STATE)[keyof typeof RETURN_STATE];
export type ReturnEvidenceKind =
  (typeof RETURN_EVIDENCE_KIND)[keyof typeof RETURN_EVIDENCE_KIND];
export interface ReturnGate {
  status: 'PENDING' | 'READY' | 'CLOSED';
  amount: number;
  at: Date | null;
  mode: ReconciliationMode | null;
}
