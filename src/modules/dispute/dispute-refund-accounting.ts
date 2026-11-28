import { ConflictException } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { BASIS_POINTS_SCALE } from '@/common/constants/money.constant';
import {
  COD_RECONCILIATION_STATUS,
  RECONCILIATION_REVIEW_REASON,
} from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { SHOP_LEDGER_ENTRY_TYPE } from '@/modules/shop-finance/constants/payout.constant';

import { DisputeRefundCredit } from './entities/dispute-refund-credit.entity';

export function refundAllocation(
  price: number,
  entitlement: number,
  basisPoints: number,
) {
  const amountsValid =
    [price, entitlement, basisPoints].every(Number.isSafeInteger) &&
    price > 0 &&
    entitlement > 0 &&
    entitlement <= price &&
    basisPoints >= 0 &&
    basisPoints <= BASIS_POINTS_SCALE;
  if (!amountsValid) throw new ConflictException('Invalid refund allocation');
  const fee = (remaining: number) =>
    Number(
      (BigInt(remaining) * BigInt(basisPoints)) / BigInt(BASIS_POINTS_SCALE),
    );
  const commissionReversed = fee(price) - fee(price - entitlement);
  return {
    amount: entitlement,
    commissionReversed,
    sellerDebit: entitlement - commissionReversed,
  };
}

export async function orderRefundDebit(
  manager: EntityManager,
  orderId: string,
  shopId: string,
  mode: ReconciliationMode,
) {
  const rows = await manager.find(DisputeRefundCredit, {
    where: { orderId, shopId },
  });
  if (rows.some((row) => row.mode !== mode)) {
    throw new ConflictException('Refund and settlement source modes disagree');
  }
  return rows.reduce((sum, row) => sum + row.sellerDebit, 0);
}

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
    LEFT JOIN shop_ledger_entries entry ON entry."orderId"=refund."orderId" AND entry."shopId"=refund."shopId" AND entry.mode=refund.mode AND entry.type<>$6
    LEFT JOIN shop_settlements release ON release."orderId"=refund."orderId" AND release."shopId"=refund."shopId" AND release.mode=refund.mode
    LEFT JOIN cod_collections collection ON collection."orderId"=refund."orderId" AND collection."shopId"=refund."shopId" AND collection.mode=refund.mode
    WHERE refund."shopId"=$1 AND refund.mode=$2`,
    [
      shopId,
      mode,
      [COD_RECONCILIATION_STATUS.AWAITING, COD_RECONCILIATION_STATUS.PARTIAL],
      COD_RECONCILIATION_STATUS.REVIEW,
      RECONCILIATION_REVIEW_REASON.CARRIER_OR_ORDER_REQUIRES_REVIEW,
      SHOP_LEDGER_ENTRY_TYPE.COD_SHIPPING_DEBIT,
    ],
  );
  return {
    funded: Number(row.funded),
    settled: Number(row.settled),
    receivable: Number(row.receivable),
  };
}
