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

import { MOMO_CLIENT } from './payment.config';
import { PaymentAttempt, PaymentRefund } from './payment.entity';
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
    }, 5000);
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
        state: In(['CREATING', 'PENDING', 'UNKNOWN']),
        nextQueryAt: LessThanOrEqual(due),
      },
      order: { nextQueryAt: 'ASC' },
      take: 4,
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
        state: In(['QUEUED', 'UNKNOWN', 'REVIEW_REQUIRED']),
        nextQueryAt: LessThanOrEqual(due),
      },
      order: { nextQueryAt: 'ASC' },
      take: 4,
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
      if (refund.state === 'COMPLETED' || refund.nextQueryAt > current)
        return null;
      const payment = await manager.findOneByOrFail(PaymentAttempt, {
        id: refund.paymentId,
      });
      const submit = refund.state === 'QUEUED';
      if (
        !refund.alertedAt &&
        (refund.state === 'REVIEW_REQUIRED' ||
          current.getTime() - refund.createdAt.getTime() >= 1800000)
      ) {
        refund.alertedAt = current;
        this.logger.error({
          refundId: id,
          message:
            'Refund incident: admin response required within four continuous hours',
        });
      }
      if (refund.state === 'REVIEW_REQUIRED') {
        refund.nextQueryAt = new Date(current.getTime() + 3600000);
        await manager.save(refund);
        return null;
      }
      refund.state = 'UNKNOWN';
      refund.nextQueryAt = new Date(current.getTime() + 75000);
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
        complete = result.resultCode === 0 && result.transId > 0;
        definitiveError =
          !complete && ![1000, 7000, 7002].includes(result.resultCode);
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
        if (refund.state === 'COMPLETED') return;
        if (complete) {
          refund.state = 'COMPLETED';
          const obligations = await manager.find(PaymentRefund, {
            where: { paymentId: refund.paymentId },
          });
          if (
            obligations.every(
              (item) => item.id === refund.id || item.state === 'COMPLETED',
            )
          ) {
            await manager.update(
              PaymentAttempt,
              { id: refund.paymentId, state: 'REFUND_REQUIRED' },
              { state: 'REFUNDED' },
            );
          }
        } else if (definitiveError) {
          refund.state = 'REVIEW_REQUIRED';
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
