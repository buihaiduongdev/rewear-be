import { randomUUID } from 'node:crypto';

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { DataSource, In, LessThanOrEqual } from 'typeorm';

import { MomoSandboxClient } from '@/infrastructure/payment/momo-sandbox.client';

import {
  PAYMENT_ATTEMPT_STATE,
  PAYMENT_PROVIDER_SUCCESS_CODE,
  PAYMENT_QUERY_LEASE_MS,
  PAYMENT_RECONCILIATION_BATCH_SIZE,
  PAYMENT_REFUND_ALERT_AFTER_MS,
  PAYMENT_REFUND_PENDING_CODES,
  PAYMENT_REFUND_REVIEW_RETRY_MS,
  PAYMENT_REFUND_STATE,
  PAYMENT_WORKER_INTERVAL_MS,
} from './constants/payment.constant';
import { PaymentAttempt, PaymentRefund } from './entities/payment.entity';
import { MOMO_CLIENT } from './payment.config';
import { PaymentService } from './payment.service';

@Injectable()
export class PaymentWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly db: DataSource,
    private readonly payments: PaymentService,
    @Inject(MOMO_CLIENT) private readonly client: MomoSandboxClient | null,
  ) {}

  onModuleInit() {
    if (!this.client) return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.run()
        .catch(() =>
          this.logger.error(
            'Payment reconciliation failed; records remain pending',
          ),
        )
        .finally(() => {
          this.running = false;
        });
    }, PAYMENT_WORKER_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run() {
    if (!this.client) return;
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
    // Bounded independent requests. Database leases prevent cross-instance overlap.
    await Promise.all(
      attempts.map(async (attempt) => {
        try {
          await this.payments.queryAttempt(attempt.id);
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
  }

  async refund(id: string) {
    if (!this.client) return;
    const job = await this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      const current = new Date(now);
      const refund = await manager.findOneByOrFail(PaymentRefund, { id });
      if (
        refund.state === PAYMENT_REFUND_STATE.COMPLETED ||
        refund.nextQueryAt > current
      )
        return null;
      const payment = await manager.findOneByOrFail(PaymentAttempt, {
        id: refund.paymentId,
      });
      const submit = refund.state === PAYMENT_REFUND_STATE.QUEUED;
      if (
        !refund.alertedAt &&
        (refund.state === PAYMENT_REFUND_STATE.REVIEW_REQUIRED ||
          current.getTime() - refund.createdAt.getTime() >=
            PAYMENT_REFUND_ALERT_AFTER_MS)
      ) {
        refund.alertedAt = current;
        this.logger.error({
          refundId: id,
          message:
            'Refund incident: admin response required within four continuous hours',
        });
      }
      if (refund.state === PAYMENT_REFUND_STATE.REVIEW_REQUIRED) {
        refund.nextQueryAt = new Date(
          current.getTime() + PAYMENT_REFUND_REVIEW_RETRY_MS,
        );
        await manager.save(refund);
        return null;
      }
      refund.state = PAYMENT_REFUND_STATE.UNKNOWN;
      refund.nextQueryAt = new Date(current.getTime() + PAYMENT_QUERY_LEASE_MS);
      await manager.save(refund);
      return { refund, payment, submit };
    });
    if (!job) return;
    try {
      let complete = false;
      let definitiveError = false;
      if (job.submit) {
        const result = await this.client.refund({
          orderId: job.refund.id,
          requestId: job.refund.id,
          amount: job.refund.amount,
          transId: Number(job.refund.providerTransId),
        });
        complete =
          result.resultCode === PAYMENT_PROVIDER_SUCCESS_CODE &&
          result.transId > 0;
        definitiveError =
          !complete &&
          !PAYMENT_REFUND_PENDING_CODES.includes(result.resultCode);
      } else {
        complete = await this.client.queryRefund(
          job.refund.id,
          randomUUID(),
          job.refund.amount,
        );
      }
      await this.db.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
        const refund = await manager.findOneByOrFail(PaymentRefund, { id });
        if (refund.state === PAYMENT_REFUND_STATE.COMPLETED) return;
        if (complete) {
          refund.state = PAYMENT_REFUND_STATE.COMPLETED;
          const obligations = await manager.find(PaymentRefund, {
            where: { paymentId: refund.paymentId },
          });
          if (
            obligations.every(
              (item) =>
                item.id === refund.id ||
                item.state === PAYMENT_REFUND_STATE.COMPLETED,
            )
          ) {
            await manager.update(
              PaymentAttempt,
              {
                id: refund.paymentId,
                state: PAYMENT_ATTEMPT_STATE.REFUND_REQUIRED,
              },
              { state: PAYMENT_ATTEMPT_STATE.REFUNDED },
            );
          }
        } else if (definitiveError) {
          refund.state = PAYMENT_REFUND_STATE.REVIEW_REQUIRED;
          refund.nextQueryAt = new Date();
        }
        await manager.save(refund);
      });
    } catch {
      // UNKNOWN is persisted before submitting. Query it on the next lease;
      // never create another refund ID after a timeout or process restart.
    }
  }
}
