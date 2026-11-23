import { ConflictException } from '@nestjs/common';

import { EntityManager, In } from 'typeorm';

import { safeBalanceSchema } from '@/common/schemas/money.schema';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';

import { walletPoolFields } from '../../checkout/policies/wallet-checkout.policy';
import { WalletAccount } from '../../entities/wallet.entity';
import {
  EXCESS_EVENT,
  EXCESS_METHOD,
  EXCESS_PAYMENT_STATE,
  EXCESS_REVIEW,
} from '../constants/excess.constant';
import {
  ExcessCollection,
  ExcessOffsetSource,
  ExcessReturn,
  WalletExcess,
} from '../entities/excess.entity';
import { excessEvent } from '../excess.lifecycle';
import type { ExcessSource } from '../types/excess.type';
import { excessSource } from './excess-source.policy';

export async function excessTotals(manager: EntityManager, row: WalletExcess) {
  const collected = Number(
    (await manager.sum(ExcessCollection, 'amount', { excessId: row.id })) ?? 0,
  );
  const returned = Number(
    (await manager.sum(ExcessReturn, 'amount', { excessId: row.id })) ?? 0,
  );
  const [held] = await manager.query(
    `SELECT COALESCE(SUM((x->>'amount')::bigint),0) amount FROM wallet_excess_captures c CROSS JOIN LATERAL jsonb_array_elements(c.reservations) x WHERE x->>'excessId'=$1`,
    [row.id],
  );
  const liability = row.sourceAmount - row.authorizedAmount;
  const net = collected - returned;
  return {
    liability,
    collected,
    returned,
    net,
    reserved: Number(held.amount),
    outstanding: Math.max(0, liability - net - Number(held.amount)),
  };
}
export async function changeExcessWallet(
  manager: EntityManager,
  buyerId: string,
  mode: ReconciliationMode,
  delta: number,
) {
  const account = await manager.findOneByOrFail(WalletAccount, {
    userId: buyerId,
  });
  const [field, held] = walletPoolFields(mode);
  const balance = account[field] + delta;
  if (
    !safeBalanceSchema.safeParse(balance).success ||
    !safeBalanceSchema.safeParse(balance + account[held]).success
  )
    throw new ConflictException(
      'Wallet recovery balance requires reconciliation',
    );
  account[field] = balance;
  await manager.save(account);
}
export async function collectExcessWallet(
  manager: EntityManager,
  row: WalletExcess,
  amount: number,
  sourceId: string,
) {
  if (amount <= 0) return;
  if (amount > (await excessTotals(manager, row)).outstanding)
    throw new ConflictException('Recovery exceeds liability');
  await changeExcessWallet(manager, row.buyerId, row.mode, -amount);
  await manager.save(
    ExcessCollection,
    manager.create(ExcessCollection, {
      excessId: row.id,
      buyerId: row.buyerId,
      mode: row.mode,
      method: EXCESS_METHOD.WALLET,
      sourceId,
      amount,
    }),
  );
  await excessEvent(
    manager,
    row,
    null,
    EXCESS_EVENT.OFFSET,
    'Verified wallet refund allocated to recovery',
    { amount, sourceId },
  );
}
/** Called only after the real source credit and wallet balance are saved, under commerce lock. */
export async function offsetExcessRefund(
  manager: EntityManager,
  type: ExcessSource,
  sourceId: string,
) {
  if (
    await manager.existsBy(ExcessOffsetSource, { sourceType: type, sourceId })
  )
    return;
  const source = await excessSource(manager, type, sourceId);
  await manager.save(
    ExcessOffsetSource,
    manager.create(ExcessOffsetSource, {
      sourceType: type,
      sourceId,
      amount: source.amount,
    }),
  );
  let remaining = source.amount;
  const rows = await manager.find(WalletExcess, {
    where: {
      buyerId: source.buyerId,
      mode: source.mode,
      reviewState: In([EXCESS_REVIEW.NONE, EXCESS_REVIEW.CLOSED]),
    },
    order: { verifiedAt: 'ASC', id: 'ASC' },
  });
  for (const row of rows) {
    const sameSource = row.sourceType === type && row.sourceId === sourceId;
    if (sameSource) continue;
    const amount = Math.min(
      remaining,
      (await excessTotals(manager, row)).outstanding,
    );
    await collectExcessWallet(manager, row, amount, sourceId);
    remaining -= amount;
    if (!remaining) break;
  }
}
export async function returnExcessCollections(
  manager: EntityManager,
  row: WalletExcess,
) {
  const totals = await excessTotals(manager, row);
  let extra = Math.max(0, totals.net - totals.liability);
  const collections = await manager.find(ExcessCollection, {
    where: { excessId: row.id },
    order: { createdAt: 'DESC', id: 'DESC' },
  });
  for (const collection of collections) {
    if (!extra) break;
    const refunded = Number(
      (await manager.sum(ExcessReturn, 'amount', {
        collectionId: collection.id,
      })) ?? 0,
    );
    const amount = Math.min(extra, collection.amount - refunded);
    if (!amount) continue;
    const wallet = collection.method === EXCESS_METHOD.WALLET;
    await manager.save(
      ExcessReturn,
      manager.create(ExcessReturn, {
        excessId: row.id,
        collectionId: collection.id,
        buyerId: row.buyerId,
        mode: row.mode,
        method: collection.method,
        amount,
        state: wallet
          ? EXCESS_PAYMENT_STATE.SUCCEEDED
          : EXCESS_PAYMENT_STATE.PENDING,
      }),
    );
    if (wallet)
      await changeExcessWallet(manager, row.buyerId, row.mode, amount);
    extra -= amount;
    await excessEvent(
      manager,
      row,
      null,
      EXCESS_EVENT.RETURNED,
      'Recovery corrected; return to original collection source',
      { amount, method: collection.method },
    );
  }
}
