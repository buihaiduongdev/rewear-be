import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { DataSource, EntityManager, Not } from 'typeorm';

import { BASIS_POINTS_SCALE } from '@/common/constants/money.constant';
import { reconciliationMoney } from '@/modules/cod-reconciliation/cod-reconciliation.service';
import {
  COD_RECONCILIATION_STATUS,
  RECONCILIATION_MODE,
  RECONCILIATION_REVIEW_REASON,
  SHOP_LEDGER_TYPE,
} from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { CodCollection } from '@/modules/cod-reconciliation/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { adjustPurchaseReward } from '@/modules/coins/coin-reward.service';
import { verifiedOrderCoinDebit } from '@/modules/coins/coin.service';
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxService } from '@/modules/event/outbox.service';
import { ORDER_PAYMENT_METHOD } from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities';
import { resolveOrderHeldCredit } from '@/modules/order/order-funding.service';
import { Shipment } from '@/modules/shipment/entities/shipment.entity';
import { SHOP_LEDGER_ENTRY_TYPE } from '@/modules/shop-finance/constants/payout.constant';
import { ShopLedgerEntry } from '@/modules/shop-finance/entities/shop-ledger.entity';
import { WalletAccount, WalletCredit } from '@/modules/wallet/entities';
import { walletBalanceSchema } from '@/modules/wallet/schemas/wallet.schema';

import {
  DISPUTE_DECISION_OUTCOME,
  DISPUTE_ISSUE_STATE,
  DISPUTE_POLICY,
  RETURN_STATE,
} from './constants/dispute.constant';
import {
  assertDisputeParty,
  restoreDisputeCaseIfClear,
} from './dispute.service';
import { DisputeCase } from './entities/dispute-case.entity';
import { DisputeDecision } from './entities/dispute-decision.entity';
import { DisputeIssue } from './entities/dispute-issue.entity';
import { DisputeRefundCredit } from './entities/dispute-refund-credit.entity';
import { DisputeReturn } from './entities/dispute-return.entity';

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

export async function refundFunding(
  manager: EntityManager,
  order: Order,
  now: Date,
) {
  if (await manager.existsBy(WalletCredit, { orderId: order.id })) return null;
  const shipment = await manager.findOneBy(Shipment, { orderId: order.id });
  if (!shipment) return null;
  const money = reconciliationMoney(order);
  if (
    order.paymentMethod === ORDER_PAYMENT_METHOD.PAYOS ||
    order.paymentMethod === ORDER_PAYMENT_METHOD.MOMO ||
    order.paymentMethod === ORDER_PAYMENT_METHOD.WALLET
  ) {
    const credit = await resolveOrderHeldCredit(manager, order, shipment);
    return credit ? { mode: credit.mode } : null;
  }
  if (order.paymentMethod !== ORDER_PAYMENT_METHOD.COD) return null;
  const collection = await manager.findOneBy(CodCollection, {
    orderId: order.id,
  });
  if (!collection) return null;
  if (!(await verifiedOrderCoinDebit(manager, order, collection.mode))) {
    return null;
  }
  const reviewAcceptable =
    collection.reviewReason === null ||
    collection.reviewReason ===
      RECONCILIATION_REVIEW_REASON.CARRIER_OR_ORDER_REQUIRES_REVIEW;
  const proofMatches =
    collection.collectedAmount === order.total &&
    collection.expectedAmount === order.total &&
    collection.shopId === order.shopId &&
    collection.shipmentId === shipment.id &&
    collection.waybillCode === shipment.orderCode &&
    collection.gross === money.gross &&
    collection.commission === money.commission &&
    collection.sellerNet === money.sellerNet &&
    collection.collectedAt <= now &&
    Object.values(RECONCILIATION_MODE).includes(collection.mode) &&
    reviewAcceptable;
  if (!proofMatches) return null;
  const credit = await manager.findOneBy(ShopLedgerEntry, {
    orderId: order.id,
    type: Not(SHOP_LEDGER_ENTRY_TYPE.COD_SHIPPING_DEBIT),
  });
  const creditMatches =
    credit?.mode === collection.mode &&
    credit.amount === money.sellerNet &&
    credit.shopId === order.shopId &&
    credit.type === SHOP_LEDGER_TYPE.COD_FUNDED_HELD &&
    credit.collectionId === collection.id &&
    collection.cashReceived + collection.feeDeducted === order.total;
  if (credit && !creditMatches) return null;
  return { mode: collection.mode };
}

@Injectable()
export class DisputeRefundService {
  private readonly logger = new Logger(DisputeRefundService.name);
  private cursor: string | undefined;

  constructor(
    private readonly db: DataSource,
    private readonly outboxService: OutboxService,
  ) {}

  async view(userId: string, decisionId: string, admin = false) {
    const manager = this.db.manager;
    const decision = await manager.findOneOrFail(DisputeDecision, {
      where: { id: decisionId },
      relations: { issue: { case: { order: true } } },
    });
    const { issue } = decision;
    const { order } = issue.case;
    if (!admin) {
      await assertDisputeParty(manager, userId, order.id, order);
    }
    const entitlement = decision.finalRefundAmount ?? decision.refundAmount;
    const approved = entitlement
      ? refundAllocation(
          decision.itemPrice,
          entitlement,
          order.commissionBasisPoints,
        )
      : null;
    const [returnCase, credit] = await Promise.all([
      manager.findOneBy(DisputeReturn, { decisionId }),
      manager.findOneBy(DisputeRefundCredit, { decisionId }),
    ]);
    return {
      decisionId,
      issueStatus: issue.status,
      finalRefundAmount: decision.finalRefundAmount,
      approvedSellerDebit: approved?.sellerDebit ?? null,
      returnCase,
      credit,
    };
  }

  async execute(decisionId: string) {
    return this.db.transaction(async (manager) => {
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      return this.executeInTransaction(manager, decisionId, new Date(now));
    });
  }

  async executeInTransaction(
    manager: EntityManager,
    decisionId: string,
    now: Date,
  ): Promise<DisputeRefundCredit | null> {
    const meta = await manager
      .createQueryBuilder(DisputeCase, 'c')
      .innerJoin(DisputeIssue, 'i', 'i.caseId = c.id')
      .innerJoin(
        DisputeDecision,
        'd',
        'd.issueId = i.id AND d.id = :decisionId',
        { decisionId },
      )
      .select('c.id', 'caseId')
      .addSelect('c.orderId', 'orderId')
      .addSelect('i.id', 'issueId')
      .getRawOne<{ caseId: string; orderId: string; issueId: string }>();
    if (!meta) {
      await manager.findOneByOrFail(DisputeDecision, { id: decisionId });
      return null;
    }
    const order = await manager.findOneOrFail(Order, {
      where: { id: meta.orderId },
      lock: { mode: 'pessimistic_write' },
    });
    const issue = await manager.findOneOrFail(DisputeIssue, {
      where: { id: meta.issueId },
      lock: { mode: 'pessimistic_write' },
    });
    const decision = await manager.findOneOrFail(DisputeDecision, {
      where: { id: decisionId },
      lock: { mode: 'pessimistic_write' },
    });
    const existing = await manager.findOneBy(DisputeRefundCredit, {
      decisionId,
    });
    if (existing) return existing;
    if (
      !decision.finalizedAt ||
      !decision.finalOutcome ||
      decision.finalOutcome === DISPUTE_DECISION_OUTCOME.REJECT_CLAIM ||
      !decision.finalRefundAmount
    ) {
      return null;
    }
    if (issue.status !== DISPUTE_ISSUE_STATE.AWAITING_EXECUTION) return null;

    if (decision.finalOutcome === DISPUTE_DECISION_OUTCOME.REQUIRE_RETURN) {
      const returnCase = await manager.findOneBy(DisputeReturn, { decisionId });
      if (!returnCase) return null;
      if (
        returnCase.state === RETURN_STATE.AWAITING_HANDOVER &&
        !returnCase.handoverAt &&
        returnCase.handoverBy &&
        now > returnCase.handoverBy
      ) {
        returnCase.state = RETURN_STATE.EXPIRED;
        await manager.save(returnCase);
      }
      if (returnCase.state === RETURN_STATE.EXPIRED) {
        issue.status = DISPUTE_ISSUE_STATE.RESOLVED_NO_REFUND;
        await manager.save(issue);
        await restoreDisputeCaseIfClear(manager, issue.caseId);
        return null;
      }
      if (returnCase.state !== RETURN_STATE.READY) return null;
    }

    const funding = await refundFunding(manager, order, now);
    if (!funding) return null;

    const allocation = refundAllocation(
      decision.itemPrice,
      decision.finalRefundAmount,
      order.commissionBasisPoints,
    );

    const credit = await manager.save(
      DisputeRefundCredit,
      manager.create(DisputeRefundCredit, {
        decisionId: decision.id,
        orderId: order.id,
        buyerId: order.buyerId,
        shopId: order.shopId,
        mode: funding.mode,
        ...allocation,
        createdAt: now,
      }),
    );

    if (allocation.amount > 0) {
      await this.creditBuyerWallet(
        manager,
        order.buyerId,
        funding.mode,
        allocation.amount,
      );
    }
    await adjustPurchaseReward(manager, order, now);

    issue.status = DISPUTE_ISSUE_STATE.RESOLVED_REFUND;
    await manager.save(issue);
    await this.outboxService.record(manager, {
      eventType: EVENT_TYPES.DISPUTE_UPDATED,
      resourceId: meta.caseId,
      payload: {
        disputeCaseId: meta.caseId,
        orderId: order.id,
        buyerId: order.buyerId,
        shopId: order.shopId,
        event: `refunded:${credit.id}`,
        includeAdmins: false,
        sendEmail: true,
      },
    });
    await restoreDisputeCaseIfClear(manager, issue.caseId);
    return credit;
  }

  private async creditBuyerWallet(
    manager: EntityManager,
    userId: string,
    mode: string,
    amount: number,
  ) {
    await manager
      .createQueryBuilder()
      .insert()
      .into(WalletAccount)
      .values({ userId })
      .orIgnore()
      .execute();
    const account = await manager.findOneOrFail(WalletAccount, {
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
    const field =
      mode === RECONCILIATION_MODE.SIMULATION ? 'simulationBalance' : 'balance';
    const balance = account[field] + amount;
    const held =
      mode === RECONCILIATION_MODE.SIMULATION
        ? (account.simulationHeldBalance ?? 0)
        : (account.heldBalance ?? 0);
    if (!walletBalanceSchema.safeParse(balance + held).success) {
      throw new ConflictException('Wallet refund exceeds safe balance');
    }
    account[field] = balance;
    await manager.save(account);
  }

  async run() {
    const query = this.db.manager
      .createQueryBuilder(DisputeDecision, 'decision')
      .innerJoin(DisputeIssue, 'issue', 'issue.id = decision.issueId')
      .leftJoin(DisputeReturn, 'ret', 'ret.decisionId = decision.id')
      .where('issue.status = :status', {
        status: DISPUTE_ISSUE_STATE.AWAITING_EXECUTION,
      })
      .andWhere('decision.finalizedAt IS NOT NULL')
      .andWhere(
        '(decision.finalOutcome != :requireReturn OR ret.state IN (:...returnStates))',
        {
          requireReturn: DISPUTE_DECISION_OUTCOME.REQUIRE_RETURN,
          returnStates: [RETURN_STATE.READY, RETURN_STATE.EXPIRED],
        },
      )
      .select('decision.id', 'id')
      .orderBy('decision.id', 'ASC')
      .limit(DISPUTE_POLICY.BATCH_SIZE);

    if (this.cursor) {
      query.andWhere('decision.id > :cursor', { cursor: this.cursor });
    }
    const rows = await query.getRawMany<{ id: string }>();

    for (const row of rows) {
      this.cursor = row.id;
      try {
        await this.execute(row.id);
      } catch (error) {
        this.logger.error({
          decisionId: row.id,
          message:
            error instanceof Error ? error.message : 'Refund execution failed',
        });
      }
    }
    if (rows.length < DISPUTE_POLICY.BATCH_SIZE) this.cursor = undefined;
  }
}
