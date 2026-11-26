import { ConflictException } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import {
  COD_RECONCILIATION_STATUS,
  RECONCILIATION_REVIEW_REASON,
} from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import { DisputeRefundCredit } from './entities/dispute-refund.entity';

export async function orderRefundDebit(
  manager: EntityManager,
  orderId: string,
  shopId: string,
  mode: ReconciliationMode,
) {
  const rows = await manager.find(DisputeRefundCredit, {
    where: { orderId, shopId },
  });
  if (rows.some((row) => row.mode !== mode))
    throw new ConflictException('Refund and settlement source modes disagree');
  return rows.reduce((sum, row) => sum + row.sellerDebit, 0);
}

/** Group refunds by their own order's funding/settlement, never charge another order's pool. */
export async function shopRefundDeductions(
  manager: EntityManager,
  shopId: string,
  mode: ReconciliationMode,
) {
  const [row] = await manager.query(
    `
    SELECT COALESCE(SUM(CASE WHEN entry.id IS NOT NULL THEN refund."sellerDebit" ELSE 0 END),0) AS funded,
      COALESCE(SUM(CASE WHEN release.id IS NOT NULL THEN refund."sellerDebit" ELSE 0 END),0) AS settled,
      COALESCE(SUM(CASE WHEN entry.id IS NULL AND (collection.status = ANY($3::varchar[]) OR (collection.status=$4 AND collection."reviewReason"=$5)) THEN refund."sellerDebit" ELSE 0 END),0) AS receivable
    FROM dispute_refund_credits refund
    LEFT JOIN shop_ledger_entries entry ON entry."orderId"=refund."orderId" AND entry."shopId"=refund."shopId" AND entry.mode=refund.mode
    LEFT JOIN shop_settlements release ON release."orderId"=refund."orderId" AND release."shopId"=refund."shopId" AND release.mode=refund.mode
    LEFT JOIN cod_collections collection ON collection."orderId"=refund."orderId" AND collection."shopId"=refund."shopId" AND collection.mode=refund.mode
    WHERE refund."shopId"=$1 AND refund.mode=$2`,
    [
      shopId,
      mode,
      [COD_RECONCILIATION_STATUS.AWAITING, COD_RECONCILIATION_STATUS.PARTIAL],
      COD_RECONCILIATION_STATUS.REVIEW,
      RECONCILIATION_REVIEW_REASON.CARRIER_OR_ORDER_REQUIRES_REVIEW,
    ],
  );
  return {
    funded: Number(row.funded),
    settled: Number(row.settled),
    receivable: Number(row.receivable),
  };
}
