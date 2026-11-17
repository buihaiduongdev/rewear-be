import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { safeBalanceSchema } from '@/common/schemas/money.schema';
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
      .andWhere('collection.status IN (:...statuses)', {
        statuses: [
          COD_RECONCILIATION_STATUS.AWAITING,
          COD_RECONCILIATION_STATUS.PARTIAL,
        ],
      })
      .getRawOne<{ total: string }>();
    const releasedRow = await manager
      .createQueryBuilder(ShopSettlement, 'release')
      .select('COALESCE(SUM(release.amount),0)', 'total')
      .where('release.shopId = :shopId AND release.mode = :mode', {
        shopId,
        mode,
      })
      .getRawOne<{ total: string }>();
    const funded = Number(heldRow?.total ?? 0);
    const available = Number(releasedRow?.total ?? 0);
    const held = funded - available;
    const receivable = Number(pendingRow?.total ?? 0);
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
    return {
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
