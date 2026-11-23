import { randomUUID } from 'node:crypto';

import { ConflictException } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import {
  PAYMENT_MAX_AMOUNT,
  PAYMENT_MIN_AMOUNT,
} from '@/modules/payment/constants/payment.constant';

import {
  EXCESS_EVENT,
  EXCESS_METHOD,
  EXCESS_PAYMENT_STATE,
  EXCESS_REVIEW,
} from '../constants/excess.constant';
import {
  ExcessCapture,
  ExcessCollection,
  ExcessPayment,
  ExcessProviderRefund,
  WalletExcess,
} from '../entities/excess.entity';
import { excessEvent } from '../excess.lifecycle';
import { excessTotals } from '../policies/excess-accounting.policy';

export async function queueExcessRefund(
  manager: EntityManager,
  capture: ExcessCapture,
  amount: number,
  now: Date,
  returnId: string | null = null,
) {
  if (amount <= 0) return;
  const refunds = Number(
    (await manager.sum(ExcessProviderRefund, 'amount', {
      captureId: capture.id,
    })) ?? 0,
  );
  if (refunds + amount > capture.amount)
    throw new ConflictException('Recovery refund exceeds original capture');
  const unsupported =
    amount < PAYMENT_MIN_AMOUNT || amount > PAYMENT_MAX_AMOUNT;
  return manager.save(
    ExcessProviderRefund,
    manager.create(ExcessProviderRefund, {
      captureId: capture.id,
      returnId,
      amount,
      requestId: randomUUID(),
      state: unsupported
        ? EXCESS_PAYMENT_STATE.REVIEW
        : EXCESS_PAYMENT_STATE.PENDING,
      nextQueryAt: now,
      alertedAt: null,
      responseDueAt: null,
    }),
  );
}
export async function collectExcessCapture(
  manager: EntityManager,
  row: WalletExcess,
  capture: ExcessCapture,
  amount: number,
) {
  if (!amount) return;
  await manager.save(
    ExcessCollection,
    manager.create(ExcessCollection, {
      excessId: row.id,
      buyerId: row.buyerId,
      mode: row.mode,
      method: EXCESS_METHOD.MOMO,
      sourceId: capture.id,
      amount,
    }),
  );
  await excessEvent(
    manager,
    row,
    null,
    EXCESS_EVENT.CAPTURED,
    'Verified MoMo recovery payment',
    { amount },
  );
}
export async function allocateExcessCapture(
  manager: EntityManager,
  payment: ExcessPayment,
  capture: ExcessCapture,
  now: Date,
) {
  const exactFirst =
    payment.amount === capture.amount &&
    payment.state !== EXCESS_PAYMENT_STATE.SUCCEEDED;
  let remaining = exactFirst ? capture.amount : 0;
  for (const target of payment.targets) {
    const row = await manager.findOneByOrFail(WalletExcess, {
      id: target.excessId,
      buyerId: payment.buyerId,
    });
    const amount = Math.min(
      remaining,
      target.amount,
      (await excessTotals(manager, row)).outstanding,
    );
    if (!amount) continue;
    if (row.reviewState === EXCESS_REVIEW.OPEN)
      capture.reservations.push({ excessId: row.id, amount });
    else await collectExcessCapture(manager, row, capture, amount);
    remaining -= amount;
    capture.allocated += amount;
  }
  await manager.save(capture);
  await queueExcessRefund(
    manager,
    capture,
    capture.amount - capture.allocated,
    now,
  );
  payment.state = EXCESS_PAYMENT_STATE.SUCCEEDED;
  payment.payUrl = null;
  await manager.save(payment);
}
