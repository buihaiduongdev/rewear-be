import { ConflictException } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { safeBalanceSchema } from '@/common/schemas/money.schema';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { OPEN_DISPUTE_STATES } from '@/modules/dispute/constants/dispute.constant';
import { RETURN_STATE } from '@/modules/dispute/returns/constants/return.constant';

import {
  ACTIVE_PAYOUT_STATUSES,
  PAYOUT_SOURCE_KIND,
  PAYOUT_STATUS,
  SHOP_LEDGER_ENTRY_TYPE,
} from './constants/payout.constant';
import { ShopLedgerEntry } from './entities/shop-ledger.entity';
import type { PayoutSource } from './schemas/payout.schema';
import type { PayoutSourceRow } from './schemas/shop-finance.schema';

export function payoutSourceBalance(
  net: number,
  paid: number,
  reserved: number,
  blocked: boolean,
) {
  if (
    ![net, paid, reserved].every(
      (amount) => safeBalanceSchema.safeParse(amount).success,
    )
  )
    throw new ConflictException('Payout source requires reconciliation');
  const remaining = Math.max(0, net - paid);
  const eligible = blocked ? 0 : remaining;
  return {
    available: Math.max(0, eligible - reserved),
    paidOutDebt: Math.max(0, paid - net),
    heldShortfall: Math.max(0, reserved - eligible),
    reviewHeld: blocked ? remaining : 0,
  };
}

export async function readPayoutSources(
  manager: EntityManager,
  shopId: string,
  mode: ReconciliationMode,
  excludePayoutId?: string,
) {
  const [rows, rawShippingDebit] = await Promise.all([
    manager.query<PayoutSourceRow[]>(
      `
      WITH sources AS (
        SELECT $8::varchar AS kind, s.id AS "sourceId", s."orderId",
          GREATEST(0, s.amount - GREATEST(0, COALESCE((SELECT SUM(r."sellerDebit") FROM dispute_refund_credits r
            WHERE r."orderId"=s."orderId" AND r."shopId"=s."shopId" AND r.mode=s.mode),0)-s."refundDebit")) AS net
        FROM shop_settlements s WHERE s."shopId"=$1 AND s.mode=$2
      )
      SELECT s.*,
        COALESCE((SELECT SUM(a.amount) FROM shop_payout_allocations a JOIN shop_payouts p ON p.id=a."payoutId"
          WHERE a.kind=s.kind AND a."sourceId"=s."sourceId" AND a.mode=$2 AND p."shopId"=$1 AND p.mode=$2 AND p.status=$3),0) AS paid,
        COALESCE((SELECT SUM(a.amount) FROM shop_payout_allocations a JOIN shop_payouts p ON p.id=a."payoutId"
          WHERE a.kind=s.kind AND a."sourceId"=s."sourceId" AND a.mode=$2 AND p."shopId"=$1 AND p.mode=$2
            AND p.status=ANY($4::varchar[]) AND ($5::uuid IS NULL OR p.id<>$5)),0) AS reserved,
        (EXISTS(SELECT 1 FROM dispute_issues i JOIN dispute_cases c ON c.id=i."caseId"
          WHERE c."orderId"=s."orderId" AND i.status=ANY($6::varchar[]))
         OR EXISTS(SELECT 1 FROM dispute_returns r WHERE r."orderId"=s."orderId" AND r.state<>ALL($7::varchar[]))) AS blocked
      FROM sources s ORDER BY s.kind, s."sourceId"`,
      [
        shopId,
        mode,
        PAYOUT_STATUS.SUCCEEDED,
        [...ACTIVE_PAYOUT_STATUSES],
        excludePayoutId ?? null,
        [...OPEN_DISPUTE_STATES],
        [RETURN_STATE.READY, RETURN_STATE.EXPIRED],
        PAYOUT_SOURCE_KIND.SETTLEMENT,
      ],
    ),
    manager.sum(ShopLedgerEntry, 'amount', {
      shopId,
      mode,
      type: SHOP_LEDGER_ENTRY_TYPE.COD_SHIPPING_DEBIT,
    }),
  ]);
  const shippingDebit = Number(rawShippingDebit ?? 0);
  let remainingShippingDebit = shippingDebit;
  const result = {
    sources: [] as PayoutSource[],
    available: 0,
    paidOutDebt: 0,
    heldShortfall: 0,
    reviewHeld: 0,
    payoutLocked: 0,
    paidOut: 0,
    shippingDebit,
  };
  for (const row of rows) {
    const net = Number(row.net);
    const paid = Number(row.paid);
    const reserved = Number(row.reserved);
    const balance = payoutSourceBalance(net, paid, reserved, row.blocked);
    const availableCut = Math.min(balance.available, remainingShippingDebit);
    remainingShippingDebit -= availableCut;
    const availableAfterDebit = balance.available - availableCut;

    const reviewCut = Math.min(balance.reviewHeld, remainingShippingDebit);
    remainingShippingDebit -= reviewCut;
    const reviewHeldAfterDebit = balance.reviewHeld - reviewCut;

    const backedReserved = Math.max(0, reserved - balance.heldShortfall);
    const reservedCut = Math.min(backedReserved, remainingShippingDebit);
    remainingShippingDebit -= reservedCut;
    const heldShortfallAfterDebit = balance.heldShortfall + reservedCut;

    result.available += availableAfterDebit;
    result.paidOutDebt += balance.paidOutDebt;
    result.heldShortfall += heldShortfallAfterDebit;
    result.reviewHeld += reviewHeldAfterDebit;
    result.payoutLocked += reserved;
    result.paidOut += paid;
    if (availableAfterDebit > 0)
      result.sources.push({
        kind: row.kind,
        sourceId: row.sourceId,
        orderId: row.orderId,
        mode,
        amount: availableAfterDebit,
      });
  }
  result.paidOutDebt += remainingShippingDebit;
  if (
    ![
      result.available,
      result.paidOutDebt,
      result.heldShortfall,
      result.reviewHeld,
      result.payoutLocked,
      result.paidOut,
      result.shippingDebit,
    ].every((amount) => safeBalanceSchema.safeParse(amount).success)
  )
    throw new ConflictException('Payout totals exceed safe amount range');
  return result;
}
