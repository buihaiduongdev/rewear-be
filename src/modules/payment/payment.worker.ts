import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { DataSource, In, LessThanOrEqual } from 'typeorm';

import { PayosClient } from '@/infrastructure/payment/payos.client';

import {
  PAYMENT_ATTEMPT_STATE,
  PAYMENT_RECONCILIATION_BATCH_SIZE,
  PAYMENT_REFUND_REVIEW_RETRY_MS,
  PAYMENT_REFUND_STATE,
  PAYMENT_WORKER_INTERVAL_MS,
} from './constants/payment.constant';
import { PaymentAttempt, PaymentRefund } from './entities';
import { PAYOS_CLIENT } from './payment.config';
import { PaymentService } from './payment.service';

@Injectable()
export class PaymentWorker {
  private readonly logger = new Logger(PaymentWorker.name);
  private running = false;

  constructor(
    private readonly db: DataSource,
    private readonly paymentService: PaymentService,
    @Inject(PAYOS_CLIENT) private readonly payosClient: PayosClient | null,
  ) {}

  @Interval(PAYMENT_WORKER_INTERVAL_MS)
  async run() {
    if (!this.payosClient || this.running) return;
    this.running = true;
    try {
      const [{ now }] = await this.db.query('SELECT clock_timestamp() AS now');
      const due = new Date(now);
      const attempts = await this.db.getRepository(PaymentAttempt).find({
        where: {
          state: In([
            PAYMENT_ATTEMPT_STATE.CREATING,
            PAYMENT_ATTEMPT_STATE.PENDING,
            PAYMENT_ATTEMPT_STATE.UNKNOWN,
          ]),
          nextQueryAt: LessThanOrEqual(due),
        },
        order: { nextQueryAt: 'ASC' },
        take: PAYMENT_RECONCILIATION_BATCH_SIZE,
      });
      await Promise.all(
        attempts.map(async (attempt) => {
          try {
            await this.paymentService.queryAttempt(attempt.id);
          } catch {
            this.logger.warn({
              paymentId: attempt.id,
              message: 'Payment requires reconciliation',
            });
          }
        }),
      );
      const refunds = await this.db.getRepository(PaymentRefund).find({
        where: {
          state: In([
            PAYMENT_REFUND_STATE.QUEUED,
            PAYMENT_REFUND_STATE.UNKNOWN,
            PAYMENT_REFUND_STATE.REVIEW_REQUIRED,
          ]),
          nextQueryAt: LessThanOrEqual(due),
        },
        order: { nextQueryAt: 'ASC' },
        take: PAYMENT_RECONCILIATION_BATCH_SIZE,
      });
      await Promise.all(
        refunds.map(async (refund) => {
          try {
            await this.refund(refund.id);
          } catch {
            this.logger.warn({
              refundId: refund.id,
              message: 'Refund requires reconciliation',
            });
          }
        }),
      );
    } catch {
      this.logger.error('Payment reconciliation scan failed; retry required');
    } finally {
      this.running = false;
    }
  }

  async refund(id: string) {
    if (!this.payosClient) return;
    await this.db.transaction(async (manager) => {
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      const current = new Date(now);
      const refund = await manager.findOne(PaymentRefund, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !refund ||
        refund.state === PAYMENT_REFUND_STATE.COMPLETED ||
        refund.nextQueryAt > current
      )
        return;
      if (!refund.alertedAt) {
        refund.alertedAt = current;
        this.logger.error({
          refundId: id,
          message:
            'PayOS refund requires manual bank transfer or wallet adjustment',
        });
      }
      refund.state = PAYMENT_REFUND_STATE.REVIEW_REQUIRED;
      refund.nextQueryAt = new Date(
        current.getTime() + PAYMENT_REFUND_REVIEW_RETRY_MS,
      );
      await manager.save(refund);
    });
  }
}
