import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { safeBalanceSchema } from '@/common/schemas/money.schema';
import { RECONCILIATION_REVIEW_REASON } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import {
  COD_RECONCILIATION_STATUS,
  RECONCILIATION_MODE,
} from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { CodCollection } from '@/modules/cod-reconciliation/entities/cod-reconciliation.entity';
import {
  collectionViewSchema,
  financeListSchema,
} from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import type {
  FinanceListInput,
  ReconciliationMode,
} from '@/modules/cod-reconciliation/types/cod-reconciliation.type';
import { shopRefundDeductions } from '@/modules/dispute/dispute-refund-accounting';
import { DisputeRefundCredit } from '@/modules/dispute/entities/dispute-refund.entity';

import { ShopLedgerEntry } from './entities/shop-ledger.entity';
import { ShopSettlement } from './entities/shop-settlement.entity';

@Injectable()
export class ShopFinanceService {
  constructor(private readonly db: DataSource) {}
  async view(userId: string, shopId: string, input: FinanceListInput) {
    const data = financeListSchema.parse(input);
    const mode = data.mode ?? RECONCILIATION_MODE.EVIDENCE;
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const totals = await this.readTotals(manager, shopId, mode);
      const history = await this.readHistory(
        manager,
        shopId,
        mode,
        data.offset ?? 0,
      );
      return { shopId, mode, ...totals, ...history };
    });
  }

  private async readTotals(
    manager: EntityManager,
    shopId: string,
    mode: ReconciliationMode,
  ) {
    const heldRow = await manager
      .createQueryBuilder(ShopLedgerEntry, 'entry')
      .select('COALESCE(SUM(entry.amount),0)', 'total')
      .where('entry.shopId = :shopId AND entry.mode = :mode', { shopId, mode })
      .getRawOne<{ total: string }>();
    const pendingRow = await manager
      .createQueryBuilder(CodCollection, 'collection')
      .select('COALESCE(SUM(collection.sellerNet),0)', 'total')
      .where('collection.shopId = :shopId AND collection.mode = :mode', {
        shopId,
        mode,
      })
      .andWhere(
        `(collection.status IN (:...statuses) OR (collection.status = :review AND collection.reviewReason = :reviewReason AND EXISTS (SELECT 1 FROM dispute_refund_credits refund WHERE refund."orderId" = collection."orderId" AND refund.mode = collection.mode)))`,
        {
          review: COD_RECONCILIATION_STATUS.REVIEW,
          reviewReason:
            RECONCILIATION_REVIEW_REASON.CARRIER_OR_ORDER_REQUIRES_REVIEW,
          statuses: [
            COD_RECONCILIATION_STATUS.AWAITING,
            COD_RECONCILIATION_STATUS.PARTIAL,
          ],
        },
      )
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM shop_ledger_entries entry WHERE entry."orderId" = collection."orderId" AND entry.mode = collection.mode)',
      )
      .getRawOne<{ total: string }>();
    const releasedRow = await manager
      .createQueryBuilder(ShopSettlement, 'release')
      .select('COALESCE(SUM(release.amount),0)', 'total')
      .addSelect('COALESCE(SUM(release.refundDebit),0)', 'refundDebit')
      .where('release.shopId = :shopId AND release.mode = :mode', {
        shopId,
        mode,
      })
      .getRawOne<{ total: string; refundDebit: string }>();
    const funded = Number(heldRow?.total ?? 0);
    const released = Number(releasedRow?.total ?? 0);
    const deductions = await shopRefundDeductions(manager, shopId, mode);
    const lateDebit =
      deductions.settled - Number(releasedRow?.refundDebit ?? 0);
    const available = released - lateDebit;
    const held = funded - deductions.funded - released + lateDebit;
    const receivable = Number(pendingRow?.total ?? 0) - deductions.receivable;
    const hasInvalidHeldTotal = !safeBalanceSchema.safeParse(held).success;
    const hasInvalidReceivableTotal =
      !safeBalanceSchema.safeParse(receivable).success;
    const hasInvalidAvailableTotal =
      !safeBalanceSchema.safeParse(available).success;
    const hasInvalidFundedTotal = !safeBalanceSchema.safeParse(funded).success;
    const exceedsSafeRange =
      hasInvalidHeldTotal ||
      hasInvalidReceivableTotal ||
      hasInvalidAvailableTotal ||
      hasInvalidFundedTotal;
    if (exceedsSafeRange)
      throw new ConflictException('Shop totals exceed safe amount range');
    return { held, receivable, available };
  }

  private async readHistory(
    manager: EntityManager,
    shopId: string,
    mode: ReconciliationMode,
    offset: number,
  ) {
    const entries = await manager.find(ShopLedgerEntry, {
      where: { shopId, mode },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
      skip: offset,
    });
    const collections = await manager.find(CodCollection, {
      where: { shopId, mode },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
      skip: offset,
    });
    const settlements = await manager.find(ShopSettlement, {
      where: { shopId, mode },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
      skip: offset,
    });
    const refunds = await manager.find(DisputeRefundCredit, {
      where: { shopId, mode },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
      skip: offset,
    });
    return {
      refunds,
      settlements: settlements.map(({ id, orderId, amount, createdAt }) => ({
        id,
        orderId,
        amount,
        createdAt,
      })),
      entries: entries.map(({ id, orderId, type, amount, createdAt }) => ({
        id,
        orderId,
        type,
        amount,
        createdAt,
      })),
      collections: collections.map((row) => collectionViewSchema.parse(row)),
    };
  }
}
