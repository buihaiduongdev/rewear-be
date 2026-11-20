import { randomUUID } from 'node:crypto';

import { EntityManager } from 'typeorm';

import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';
import { readPayoutSources } from '@/modules/shop-finance/payout-sources';
import { allocatePayout } from '@/modules/shop-finance/payouts/payout-policy';

import {
  FEE_COLLECTION_METHOD,
  FEE_PARTY,
  FEE_STATUS,
} from '../constants/fee.constant';
import { FeeAssessment } from '../entities/fee.entity';
import { feeOutstanding, recordFeeCollection } from '../fee-accounting';
import { FeeOffsetAllocation } from './entities/fee-settlement.entity';

/** Shared commerce lock protects these allocations and competing payout/payment writes. */
export async function settleShopFees(
  manager: EntityManager,
  shopId: string,
  mode: ReconciliationMode,
  now: Date,
) {
  const fees = await manager.find(FeeAssessment, {
    where: { shopId, mode, party: FEE_PARTY.SHOP, status: FEE_STATUS.ACTIVE },
    order: { createdAt: 'ASC', id: 'ASC' },
  });
  for (const fee of fees) {
    const owed = await feeOutstanding(manager, fee.id);
    if (!owed) continue;
    const funds = await readPayoutSources(manager, shopId, mode);
    const amount = Math.min(owed, funds.available);
    if (!amount) break;
    const collection = await recordFeeCollection(
      manager,
      {
        feeId: fee.id,
        mode,
        method: FEE_COLLECTION_METHOD.SHOP_OFFSET,
        sourceId: randomUUID(),
        amount,
      },
      now,
    );
    const allocations = allocatePayout(funds.sources, amount);
    await manager.save(
      FeeOffsetAllocation,
      allocations.map((source) =>
        manager.create(FeeOffsetAllocation, {
          ...source,
          collectionId: collection.id,
        }),
      ),
    );
  }
}
