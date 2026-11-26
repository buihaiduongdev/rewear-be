import { Inject, Injectable } from '@nestjs/common';

import { DataSource, In, LessThanOrEqual } from 'typeorm';

import type { PayosClient } from '@/infrastructure/payment/payos.client';
import { PAYOS_CLIENT } from '@/modules/payment/payment.config';

import {
  EXCESS_EVENT,
  EXCESS_METHOD,
  EXCESS_PAYMENT_STATE,
  EXCESS_POLICY,
} from '../constants/excess.constant';
import {
  ExcessCapture,
  ExcessCollection,
  ExcessPayment,
  ExcessProviderRefund,
  ExcessReturn,
  WalletExcess,
} from '../entities';
import { excessEvent } from '../excess.lifecycle';
import { excessClock } from '../policies/excess-transaction.policy';
import { queueExcessRefund } from './excess-capture.policy';

@Injectable()
export class ExcessRefundService {
  constructor(
    private readonly db: DataSource,
    @Inject(PAYOS_CLIENT)
    private readonly client: PayosClient | null,
  ) {}

  private async queueReturns() {
    await this.db.transaction(async (manager) => {
      const now = await excessClock(manager);
      const returns = await manager
        .createQueryBuilder(ExcessReturn, 'r')
        .where('r.method = :method AND r.state = :state', {
          method: EXCESS_METHOD.PAYOS,
          state: EXCESS_PAYMENT_STATE.PENDING,
        })
        .andWhere(
          'NOT EXISTS (SELECT 1 FROM wallet_excess_provider_refunds p WHERE p."returnId" = r.id)',
        )
        .orderBy('r.createdAt', 'ASC')
        .addOrderBy('r.id', 'ASC')
        .take(EXCESS_POLICY.BATCH)
        .getMany();
      for (const row of returns) {
        if (await manager.existsBy(ExcessProviderRefund, { returnId: row.id }))
          continue;
        const collection = await manager.findOneByOrFail(ExcessCollection, {
          id: row.collectionId,
          method: EXCESS_METHOD.PAYOS,
        });
        const capture = await manager.findOneByOrFail(ExcessCapture, {
          id: collection.sourceId,
        });
        await queueExcessRefund(manager, capture, row.amount, now, row.id);
      }
    });
  }

  // PayOS VietQR payments require manual bank transfer or admin settlement on refund.
  async refund(id: string) {
    if (!this.client) return;
    await this.db.transaction(async (manager) => {
      const now = await excessClock(manager);
      const row = await manager.findOne(ExcessProviderRefund, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !row ||
        row.state === EXCESS_PAYMENT_STATE.SUCCEEDED ||
        row.nextQueryAt > now
      )
        return;
      if (!row.alertedAt) {
        row.alertedAt = now;
        row.responseDueAt = new Date(
          now.getTime() + EXCESS_POLICY.REFUND_RESPONSE_MS,
        );
        const capture = await manager.findOneByOrFail(ExcessCapture, {
          id: row.captureId,
        });
        const payment = await manager.findOneByOrFail(ExcessPayment, {
          id: capture.paymentId,
        });
        for (const target of payment.targets) {
          const recovery = await manager.findOneByOrFail(WalletExcess, {
            id: target.excessId,
          });
          await excessEvent(
            manager,
            recovery,
            null,
            EXCESS_EVENT.REFUND_ALERT,
            'PayOS recovery refund needs operational review',
            { refundId: row.id, responseDueAt: row.responseDueAt },
          );
        }
      }
      row.nextQueryAt = new Date(now.getTime() + EXCESS_POLICY.LEASE_MS);
      row.state = EXCESS_PAYMENT_STATE.REVIEW;
      await manager.save(row);
    });
  }

  async run() {
    if (!this.client) return;
    await this.queueReturns();
    const rows = await this.db.getRepository(ExcessProviderRefund).find({
      where: {
        state: In([
          EXCESS_PAYMENT_STATE.PENDING,
          EXCESS_PAYMENT_STATE.UNKNOWN,
          EXCESS_PAYMENT_STATE.REVIEW,
        ]),
        nextQueryAt: LessThanOrEqual(new Date()),
      },
      order: { nextQueryAt: 'ASC', id: 'ASC' },
      take: EXCESS_POLICY.BATCH,
    });
    for (const row of rows) await this.refund(row.id);
  }
}
