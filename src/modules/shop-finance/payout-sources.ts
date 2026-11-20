import { ConflictException } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { safeBalanceSchema } from '@/common/schemas/money.schema';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';
import { OPEN_DISPUTE_STATES } from '@/modules/dispute/constants/dispute.constant';
import { CARRIER_RECEIPT_KIND } from '@/modules/dispute/returns/constants/return-exception.constant';
import { RETURN_STATE } from '@/modules/dispute/returns/constants/return.constant';

import { PAYOUT_SOURCE_KIND } from './constants/payout-source.constant';
import {
  ACTIVE_PAYOUT_STATUSES,
  PAYOUT_STATUS,
} from './payouts/constants/payout.constant';
import type { PayoutSource } from './payouts/types/payout.type';
import { payoutSourceBalance } from './policies/payout-source-balance.policy';
import type { PayoutSourceRow } from './types/payout-source.type';

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
      SELECT $9::varchar AS kind, s.id AS "sourceId", s."orderId",
        GREATEST(0, s.amount - GREATEST(0, COALESCE((SELECT SUM(r."sellerDebit") FROM dispute_refund_credits r
          WHERE r."orderId"=s."orderId" AND r."shopId"=s."shopId" AND r.mode=s.mode),0)-s."refundDebit")) AS net
      FROM shop_settlements s WHERE s."shopId"=$1 AND s.mode=$2
      UNION ALL
      SELECT $10::varchar, c.id, c."orderId", c.amount
      FROM carrier_compensation_receipts c WHERE c."shopId"=$1 AND c.mode=$2 AND c.kind=$3
    )
    SELECT s.*,
      COALESCE((SELECT SUM(a.amount) FROM shop_payout_allocations a JOIN shop_payouts p ON p.id=a."payoutId"
        WHERE a.kind=s.kind AND a."sourceId"=s."sourceId" AND a.mode=$2 AND p."shopId"=$1 AND p.mode=$2 AND p.status=$4),0) AS paid,
      COALESCE((SELECT SUM(a.amount) FROM shop_payout_allocations a JOIN shop_payouts p ON p.id=a."payoutId"
        WHERE a.kind=s.kind AND a."sourceId"=s."sourceId" AND a.mode=$2 AND p."shopId"=$1 AND p.mode=$2
          AND p.status=ANY($5::varchar[]) AND ($6::uuid IS NULL OR p.id<>$6)),0) AS reserved,
      (EXISTS(SELECT 1 FROM dispute_issues i JOIN dispute_cases c ON c.id=i."caseId"
        WHERE c."orderId"=s."orderId" AND i.status=ANY($7::varchar[]))
       OR EXISTS(SELECT 1 FROM dispute_returns r WHERE r."orderId"=s."orderId" AND r.state<>ALL($8::varchar[])
         AND NOT EXISTS(SELECT 1 FROM dispute_return_exceptions e WHERE e."returnId"=r.id))) AS blocked
    FROM sources s ORDER BY s.kind,s."sourceId"`,
    [
      shopId,
      mode,
      CARRIER_RECEIPT_KIND.CASH,
      PAYOUT_STATUS.SUCCEEDED,
      [...ACTIVE_PAYOUT_STATUSES],
      excludePayoutId ?? null,
      [...OPEN_DISPUTE_STATES],
      [RETURN_STATE.READY, RETURN_STATE.EXPIRED],
      PAYOUT_SOURCE_KIND.SETTLEMENT,
      PAYOUT_SOURCE_KIND.COMPENSATION,
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
  };
  for (const row of rows) {
    const paid = Number(row.paid),
      reserved = Number(row.reserved);
    const balance = payoutSourceBalance(
      Number(row.net),
      paid,
      reserved,
      row.blocked,
    );
    for (const key of [
      'available',
      'paidOutDebt',
      'heldShortfall',
      'reviewHeld',
    ] as const)
      result[key] += balance[key];
    result.payoutLocked += reserved;
    result.paidOut += paid;
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
    `SELECT COALESCE(SUM(a.amount),0) AS amount
    FROM shop_payout_allocations a JOIN shop_payouts p ON p.id=a."payoutId"
    WHERE a."orderId"=$1 AND a.mode=$2 AND p.mode=$2 AND a.kind=$3
      AND p.status=ANY($4::varchar[])`,
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
