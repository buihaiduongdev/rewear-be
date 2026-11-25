import { ConflictException } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { safeBalanceSchema } from '@/common/schemas/money.schema';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { OPEN_DISPUTE_STATES } from '@/modules/dispute/constants/dispute.constant';
import { RETURN_STATE } from '@/modules/dispute/returns/constants/return.constant';
import {
  FEE_COLLECTION_METHOD,
  FEE_REFUND_STATE,
} from '@/modules/fees/constants/fee.constant';
import { feeSourceBalance } from '@/modules/fees/settlement/policies/fee-source-balance.policy';

import { PAYOUT_SOURCE_KIND } from './constants/payout-source.constant';
import {
  ACTIVE_PAYOUT_STATUSES,
  PAYOUT_STATUS,
} from './payouts/constants/payout.constant';
import type { PayoutSource } from './payouts/schemas/payout.schema';
import type { PayoutSourceRow } from './schemas/shop-finance.schema';

/** Sources remain attributable after late refunds; debt never consumes another order. */
export async function readPayoutSources(
  manager: EntityManager,
  shopId: string,
  mode: ReconciliationMode,
  excludePayoutId?: string,
) {
  const rows: PayoutSourceRow[] = await manager.query(
    `
    WITH sources AS (
      SELECT $8::varchar AS kind, s.id AS "sourceId", s."orderId",
        GREATEST(0, s.amount - GREATEST(0, COALESCE((SELECT SUM(r."sellerDebit") FROM dispute_refund_credits r
          WHERE r."orderId"=s."orderId" AND r."shopId"=s."shopId" AND r.mode=s.mode),0)-s."refundDebit")) AS net
      FROM shop_settlements s WHERE s."shopId"=$1 AND s.mode=$2
      UNION ALL
      SELECT $9::varchar, r.id, f."orderId", r.amount FROM fee_refunds r
      JOIN fee_assessments f ON f.id=r."feeId"
      WHERE f."shopId"=$1 AND f.mode=$2 AND r.mode=$2 AND r.state=$10
        AND r.method=ANY($11::varchar[])
    )
    SELECT s.*,
      COALESCE((SELECT SUM(a.amount) FROM shop_payout_allocations a JOIN shop_payouts p ON p.id=a."payoutId"
        WHERE a.kind=s.kind AND a."sourceId"=s."sourceId" AND a.mode=$2 AND p."shopId"=$1 AND p.mode=$2 AND p.status=$3),0) AS paid,
      COALESCE((SELECT SUM(a.amount) FROM shop_payout_allocations a JOIN shop_payouts p ON p.id=a."payoutId"
        WHERE a.kind=s.kind AND a."sourceId"=s."sourceId" AND a.mode=$2 AND p."shopId"=$1 AND p.mode=$2
          AND p.status=ANY($4::varchar[]) AND ($5::uuid IS NULL OR p.id<>$5)),0) AS reserved,
      COALESCE((SELECT SUM(a.amount) FROM fee_offset_allocations a JOIN fee_collections c ON c.id=a."collectionId"
        JOIN fee_assessments f ON f.id=c."feeId"
        WHERE a.kind=s.kind AND a."sourceId"=s."sourceId" AND a.mode=$2 AND c.mode=$2 AND f."shopId"=$1 AND f.mode=$2),0) AS "feeSpent",
      (s.kind<>$9 AND (EXISTS(SELECT 1 FROM dispute_issues i JOIN dispute_cases c ON c.id=i."caseId"
        WHERE c."orderId"=s."orderId" AND i.status=ANY($6::varchar[]))
       OR EXISTS(SELECT 1 FROM dispute_returns r WHERE r."orderId"=s."orderId" AND r.state<>ALL($7::varchar[])))) AS blocked
    FROM sources s ORDER BY s.kind,s."sourceId"`,
    [
      shopId,
      mode,
      PAYOUT_STATUS.SUCCEEDED,
      [...ACTIVE_PAYOUT_STATUSES],
      excludePayoutId ?? null,
      [...OPEN_DISPUTE_STATES],
      [RETURN_STATE.READY, RETURN_STATE.EXPIRED],
      PAYOUT_SOURCE_KIND.SETTLEMENT,
      PAYOUT_SOURCE_KIND.FEE_CORRECTION,
      FEE_REFUND_STATE.SUCCEEDED,
      [
        FEE_COLLECTION_METHOD.SHOP_OFFSET,
        FEE_COLLECTION_METHOD.CARRIER_NETTING,
      ],
    ],
  );
  const result = {
    sources: [] as PayoutSource[],
    available: 0,
    paidOutDebt: 0,
    heldShortfall: 0,
    reviewHeld: 0,
    payoutLocked: 0,
    paidOut: 0,
    feeDebited: 0,
    feeSourceDebt: 0,
  };
  for (const row of rows) {
    const paid = Number(row.paid),
      reserved = Number(row.reserved);
    const feeSpent = Number(row.feeSpent);
    const balance = feeSourceBalance(
      Number(row.net),
      paid,
      feeSpent,
      reserved,
      row.blocked,
    );
    for (const key of [
      'available',
      'paidOutDebt',
      'heldShortfall',
      'reviewHeld',
      'feeSourceDebt',
    ] as const)
      result[key] += balance[key];
    result.payoutLocked += reserved;
    result.paidOut += paid;
    result.feeDebited += feeSpent;
    if (balance.available > 0)
      result.sources.push({
        kind: row.kind,
        sourceId: row.sourceId,
        orderId: row.orderId,
        mode,
        amount: balance.available,
      });
  }
  if (
    ![
      result.available,
      result.paidOutDebt,
      result.heldShortfall,
      result.reviewHeld,
      result.payoutLocked,
      result.paidOut,
      result.feeDebited,
      result.feeSourceDebt,
    ].every((amount) => safeBalanceSchema.safeParse(amount).success)
  )
    throw new ConflictException('Payout totals exceed safe amount range');
  return result;
}

/** Only original settlement cash reduces the original buyer-refund cash budget. */
export async function encumberedOrderSettlement(
  manager: EntityManager,
  orderId: string,
  mode: ReconciliationMode,
) {
  const [row] = await manager.query(
    `SELECT COALESCE(SUM(amount),0) AS amount FROM (
      SELECT a.amount FROM shop_payout_allocations a JOIN shop_payouts p ON p.id=a."payoutId"
      WHERE a."orderId"=$1 AND a.mode=$2 AND p.mode=$2 AND a.kind=$3 AND p.status=ANY($4::varchar[])
      UNION ALL SELECT a.amount FROM fee_offset_allocations a JOIN fee_collections c ON c.id=a."collectionId"
      WHERE a."orderId"=$1 AND a.mode=$2 AND c.mode=$2 AND a.kind=$3
    ) spent`,
    [
      orderId,
      mode,
      PAYOUT_SOURCE_KIND.SETTLEMENT,
      [...ACTIVE_PAYOUT_STATUSES, PAYOUT_STATUS.SUCCEEDED],
    ],
  );
  const amount = Number(row.amount);
  if (!safeBalanceSchema.safeParse(amount).success)
    throw new ConflictException('Payout allocation requires reconciliation');
  return amount;
}
