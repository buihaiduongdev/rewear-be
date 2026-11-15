import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import {
  COD_RECONCILIATION_STATUS,
  RECONCILIATION_MODE,
} from '@/modules/cod-reconciliation/cod-reconciliation.constants';
import { CodCollection } from '@/modules/cod-reconciliation/cod-reconciliation.entity';
import {
  collectionViewSchema,
  financeListSchema,
} from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import type { FinanceListInput } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { OrderAccess } from '@/modules/order/order.access';

import { ShopLedgerEntry } from './shop-ledger.entity';

@Injectable()
export class ShopFinanceService {
  constructor(
    private readonly db: DataSource,
    private readonly access: OrderAccess,
  ) {}
  async view(userId: string, shopId: string, input: FinanceListInput) {
    const data = financeListSchema.parse(input),
      mode = data.mode ?? RECONCILIATION_MODE.EVIDENCE;
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      await this.access.assertManage(manager, userId, shopId);
      const heldRow = await manager
        .createQueryBuilder(ShopLedgerEntry, 'entry')
        .select('COALESCE(SUM(entry.amount),0)', 'total')
        .where('entry.shopId = :shopId AND entry.mode = :mode', {
          shopId,
          mode,
        })
        .getRawOne<{ total: string }>();
      const pending = await manager
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
      const held = Number(heldRow?.total ?? 0),
        receivable = Number(pending?.total ?? 0);
      if (!Number.isSafeInteger(held) || !Number.isSafeInteger(receivable))
        throw new ConflictException('Shop totals exceed safe amount range');
      const entries = await manager.find(ShopLedgerEntry, {
        where: { shopId, mode },
        order: { createdAt: 'DESC', id: 'DESC' },
        take: 100,
        skip: data.offset ?? 0,
      });
      const collections = await manager.find(CodCollection, {
        where: { shopId, mode },
        order: { createdAt: 'DESC', id: 'DESC' },
        take: 100,
        skip: data.offset ?? 0,
      });
      return {
        shopId,
        mode,
        held,
        receivable,
        available: 0,
        entries: entries.map(({ id, orderId, type, amount, createdAt }) => ({
          id,
          orderId,
          type,
          amount,
          createdAt,
        })),
        collections: collections.map((row) => collectionViewSchema.parse(row)),
      };
    });
  }
}
