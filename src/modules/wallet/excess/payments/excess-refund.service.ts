import { Inject, Injectable } from '@nestjs/common';

import { DataSource, In, LessThanOrEqual } from 'typeorm';

import type { MomoSandboxClient } from '@/infrastructure/payment/momo-sandbox.client';
import {
  PAYMENT_PROVIDER_SUCCESS_CODE,
  PAYMENT_REFUND_PENDING_CODES,
} from '@/modules/payment/constants/payment.constant';

import {
  EXCESS_EVENT,
  EXCESS_METHOD,
  EXCESS_MOMO_CLIENT,
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
} from '../entities/excess.entity';
import { excessEvent } from '../excess.lifecycle';
import { excessClock } from '../policies/excess-transaction.policy';
import { queueExcessRefund } from './excess-capture.policy';

@Injectable()
export class ExcessRefundService {
  constructor(
    private readonly db: DataSource,
    @Inject(EXCESS_MOMO_CLIENT)
    private readonly client: MomoSandboxClient | null,
  ) {}
  private async queueReturns() {
    await this.db.transaction(async (manager) => {
      const now = await excessClock(manager);
      const returns = await manager
        .createQueryBuilder(ExcessReturn, 'r')
        .where('r.method = :method AND r.state = :state', {
          method: EXCESS_METHOD.MOMO,
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
          method: EXCESS_METHOD.MOMO,
        });
        const capture = await manager.findOneByOrFail(ExcessCapture, {
          id: collection.sourceId,
        });
        await queueExcessRefund(manager, capture, row.amount, now, row.id);
      }
    });
  }
  private lease(id: string) {
    return this.db.transaction(async (manager) => {
      const now = await excessClock(manager);
      const row = await manager.findOneByOrFail(ExcessProviderRefund, { id });
      if (row.state === EXCESS_PAYMENT_STATE.SUCCEEDED || row.nextQueryAt > now)
        return null;
      const needsAlert =
        !row.alertedAt &&
        (row.state === EXCESS_PAYMENT_STATE.REVIEW ||
          now.getTime() - row.createdAt.getTime() >=
            EXCESS_POLICY.REFUND_ALERT_MS);
      if (needsAlert) {
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
            'MoMo recovery refund needs operational review',
            { refundId: row.id, responseDueAt: row.responseDueAt },
          );
        }
      }
      row.nextQueryAt = new Date(now.getTime() + EXCESS_POLICY.LEASE_MS);
      const submit = row.state === EXCESS_PAYMENT_STATE.PENDING;
      const review = row.state === EXCESS_PAYMENT_STATE.REVIEW;
      if (!review) row.state = EXCESS_PAYMENT_STATE.UNKNOWN;
      await manager.save(row);
      if (review) return null;
      return {
        row,
        submit,
        capture: await manager.findOneByOrFail(ExcessCapture, {
          id: row.captureId,
        }),
      };
    });
  }
  async refund(id: string) {
    const client = this.client;
    if (!client) return;
    const job = await this.lease(id);
    if (!job) return;
    try {
      let failed = false;
      if (job.submit) {
        const result = await client.refund({
          orderId: job.row.id,
          requestId: job.row.requestId,
          amount: job.row.amount,
          transId: Number(job.capture.providerTransId),
        });
        failed = ![
          PAYMENT_PROVIDER_SUCCESS_CODE,
          ...PAYMENT_REFUND_PENDING_CODES,
        ].includes(result.resultCode);
      }
      const completed =
        !failed &&
        (await client.queryRefund(
          job.row.id,
          job.row.requestId,
          job.row.amount,
        ));
      await this.db.transaction(async (manager) => {
        const now = await excessClock(manager);
        const row = await manager.findOneByOrFail(ExcessProviderRefund, { id });
        if (row.state === EXCESS_PAYMENT_STATE.SUCCEEDED) return;
        row.state = completed
          ? EXCESS_PAYMENT_STATE.SUCCEEDED
          : failed
            ? EXCESS_PAYMENT_STATE.REVIEW
            : EXCESS_PAYMENT_STATE.UNKNOWN;
        // REVIEW will trigger the durable immediate alert in lease below.
        if (failed) row.nextQueryAt = now;
        await manager.save(row);
        if (completed) {
          const payment = await manager.findOneByOrFail(ExcessPayment, {
            id: job.capture.paymentId,
          });
          for (const target of payment.targets) {
            const recovery = await manager.findOneByOrFail(WalletExcess, {
              id: target.excessId,
            });
            await excessEvent(
              manager,
              recovery,
              null,
              EXCESS_EVENT.REFUND_COMPLETED,
              'MoMo recovery refund verified complete',
              { refundId: row.id, amount: row.amount },
            );
          }
        }
        if (row.returnId && completed)
          await manager.update(
            ExcessReturn,
            { id: row.returnId },
            { state: EXCESS_PAYMENT_STATE.SUCCEEDED },
          );
      });
      if (failed) await this.lease(id);
    } catch {
      /* Unknown result: query the same request; never submit another refund. */
    }
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
