import { randomUUID } from 'node:crypto';

import { ConflictException } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import {
  FEE_COLLECTION_METHOD,
  FEE_PARTY,
  FEE_REFUND_STATE,
  FEE_STATUS,
} from './constants/fee.constant';
import { FeeAssessment, FeeCollection, FeeRefund } from './entities';
import { refundAllocations } from './policies/fee.policy';
import type { FeeCollectionMethod } from './schemas/fee.schema';

/** All mutating callers hold the shared commerce advisory transaction lock. */
export async function feeOutstanding(
  manager: EntityManager,
  feeId: string,
): Promise<number> {
  const fee = await manager.findOneByOrFail(FeeAssessment, { id: feeId });
  if (fee.status === FEE_STATUS.WAIVED || fee.status === FEE_STATUS.ABSORBED)
    return 0;
  const collected =
    (await manager.sum(FeeCollection, 'amount', { feeId })) ?? 0;
  const refunded =
    (await manager.sum(FeeRefund, 'amount', {
      feeId,
      state: FEE_REFUND_STATE.SUCCEEDED,
    })) ?? 0;
  return Math.max(0, fee.payableAmount - collected + refunded);
}
export async function recordFeeCollection(
  manager: EntityManager,
  input: {
    feeId: string;
    mode: ReconciliationMode;
    method: FeeCollectionMethod;
    sourceId: string;
    amount: number;
  },
  now: Date,
): Promise<FeeCollection> {
  const existing = await manager.findOneBy(FeeCollection, {
    feeId: input.feeId,
    method: input.method,
    sourceId: input.sourceId,
  });
  if (existing) {
    if (existing.amount !== input.amount || existing.mode !== input.mode)
      throw new ConflictException('Fee collection replay differs');
    return existing;
  }
  const fee = await manager.findOneByOrFail(FeeAssessment, { id: input.feeId });
  const owed = await feeOutstanding(manager, fee.id);
  const wrongParty =
    (input.method === FEE_COLLECTION_METHOD.WALLET &&
      fee.party !== FEE_PARTY.BUYER) ||
    (input.method === FEE_COLLECTION_METHOD.SHOP_OFFSET &&
      fee.party !== FEE_PARTY.SHOP);
  if (
    wrongParty ||
    fee.status !== FEE_STATUS.ACTIVE ||
    fee.mode !== input.mode ||
    !fee.notifiedAt ||
    (!fee.dueAt &&
      !(
        fee.party === FEE_PARTY.SHOP &&
        [
          FEE_COLLECTION_METHOD.SHOP_OFFSET,
          FEE_COLLECTION_METHOD.CARRIER_NETTING,
        ].some((method) => method === input.method)
      )) ||
    !Number.isSafeInteger(input.amount) ||
    input.amount <= 0 ||
    input.amount > owed
  )
    throw new ConflictException(
      'Fee is not collectible for this amount or pool',
    );
  return manager.save(
    FeeCollection,
    manager.create(FeeCollection, { ...input, createdAt: now }),
  );
}
/** Reserves exact original-source corrections; submission never counts as a refund. */
export async function queueFeeCorrections(
  manager: EntityManager,
  fee: FeeAssessment,
  newPayable: number,
  now: Date,
): Promise<FeeRefund[]> {
  if (
    !Number.isSafeInteger(newPayable) ||
    newPayable < 0 ||
    newPayable > fee.payableAmount
  )
    throw new ConflictException(
      'Fee corrections may only reduce the payable amount',
    );
  const collections = await manager.find(FeeCollection, {
    where: { feeId: fee.id },
    order: { createdAt: 'ASC', id: 'ASC' },
  });
  // Reverse allocation refunds cash first; carrier netting remains until real carrier restoration.
  collections.sort(
    (left, right) =>
      Number(right.method === FEE_COLLECTION_METHOD.CARRIER_NETTING) -
        Number(left.method === FEE_COLLECTION_METHOD.CARRIER_NETTING) ||
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id.localeCompare(right.id),
  );
  const refunds = await manager.findBy(FeeRefund, { feeId: fee.id });
  const reserved = new Map<string, number>();
  for (const refund of refunds)
    reserved.set(
      refund.collectionId,
      (reserved.get(refund.collectionId) ?? 0) + refund.amount,
    );
  const excess = Math.max(
    0,
    collections.reduce((sum, row) => sum + row.amount, 0) -
      newPayable -
      refunds.reduce((sum, row) => sum + row.amount, 0),
  );
  const result: FeeRefund[] = [];
  for (const allocation of refundAllocations(collections, reserved, excess)) {
    const collection = collections.find(
      (row) => row.id === allocation.collectionId,
    )!;
    result.push(
      await manager.save(
        FeeRefund,
        manager.create(FeeRefund, {
          ...allocation,
          feeId: fee.id,
          mode: collection.mode,
          method: collection.method,
          sourceId: collection.sourceId,
          state: FEE_REFUND_STATE.PENDING,
          requestId: randomUUID(),
          providerReference: null,
          requestedAt: now,
          completedAt: null,
          nextQueryAt: now,
          reason: 'Verified fee correction',
          evidence: fee.evidence,
          createdAt: now,
        }),
      ),
    );
  }
  fee.payableAmount = newPayable;
  if (newPayable === 0) fee.status = FEE_STATUS.WAIVED;
  await manager.save(FeeAssessment, fee);
  return result;
}
