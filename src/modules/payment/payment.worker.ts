import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { DataSource, EntityManager, In, LessThanOrEqual } from 'typeorm';

import { PayosClient } from '@/infrastructure/payment/payos.client';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import { WalletService } from '@/modules/wallet/wallet.service';

import {
  PAYMENT_ATTEMPT_STATE,
  PAYMENT_PROVIDER,
  PAYMENT_QUERY_LEASE_MS,
  PAYMENT_RECONCILIATION_BATCH_SIZE,
  PAYMENT_REFUND_RESOLUTION,
  PAYMENT_REFUND_REVIEW_RETRY_MS,
  PAYMENT_REFUND_STATE,
  PAYMENT_WORKER_INTERVAL_MS,
} from './constants/payment.constant';
import { PaymentAttempt, PaymentRefund } from './entities';
import { MomoClient } from './momo.client';
import { MOMO_CLIENT, PAYOS_CLIENT } from './payment.config';
import { PaymentService } from './payment.service';

@Injectable()
export class PaymentWorker {
  private readonly logger = new Logger(PaymentWorker.name);
  private running = false;

  constructor(
    private readonly db: DataSource,
    private readonly paymentService: PaymentService,
    @Inject(PAYOS_CLIENT) private readonly payosClient: PayosClient | null,
    @Inject(MOMO_CLIENT) private readonly momoClient: MomoClient | null,
    @Inject(forwardRef(() => WalletService))
    private readonly walletService: WalletService,
  ) {}

  @Interval(PAYMENT_WORKER_INTERVAL_MS)
  async run() {
    if ((!this.payosClient && !this.momoClient) || this.running) return;
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
    if (!this.payosClient && !this.momoClient) return;

    const claimed = await this.claimRefundForProcessing(id);
    if (!claimed) return;

    const { refund, attempt } = claimed;

    // 1. Attempt MoMo native refund when the payment came from MoMo.
    if (
      attempt &&
      attempt.provider === PAYMENT_PROVIDER.MOMO &&
      this.momoClient
    ) {
      const transId = Number(refund.providerTransId);
      if (Number.isSafeInteger(transId) && transId > 0) {
        try {
          const compactId = refund.id.replace(/-/g, '');
          const result = await this.momoClient.refund({
            orderId: `REFUND_${compactId}`,
            requestId: `REQ_${compactId}`,
            amount: refund.amount,
            transId,
            description: `Late payment refund ${attempt.id.slice(0, 8)}`,
          });
          if (result.succeeded) {
            await this.completeRefund(
              id,
              PAYMENT_REFUND_RESOLUTION.MOMO_REFUND,
              result.message || 'Refunded via MoMo sandbox',
            );
            return;
          }
        } catch {
          // Fall through to automatic Refund-only Wallet credit.
        }
      }
    }

    // 2. Auto-credit buyer's Refund-only Wallet for PayOS or failed MoMo refund.
    if (attempt) {
      try {
        await this.completeRefundWithWallet(id, attempt.buyerId, refund.amount);
        return;
      } catch {
        // Fall through to admin review escalation.
      }
    }

    // 3. Escalate to Admin review if automatic refund and wallet credit fail.
    await this.escalateToReview(id);
  }

  private async claimRefundForProcessing(id: string) {
    return this.db.transaction(async (manager) => {
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
      ) {
        return null;
      }
      if (refund.state === PAYMENT_REFUND_STATE.REVIEW_REQUIRED) {
        await this.markReviewAlert(manager, refund, current);
        return null;
      }
      refund.nextQueryAt = new Date(current.getTime() + PAYMENT_QUERY_LEASE_MS);
      await manager.save(refund);
      const attempt = await manager.findOneBy(PaymentAttempt, {
        id: refund.paymentId,
      });
      return { refund, attempt };
    });
  }

  private async completeRefund(
    id: string,
    method:
      | typeof PAYMENT_REFUND_RESOLUTION.MOMO_REFUND
      | typeof PAYMENT_REFUND_RESOLUTION.WALLET_CREDIT,
    note: string,
  ) {
    await this.db.transaction(async (manager) => {
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      const current = new Date(now);
      const refund = await manager.findOne(PaymentRefund, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!refund || refund.state === PAYMENT_REFUND_STATE.COMPLETED) return;
      refund.state = PAYMENT_REFUND_STATE.COMPLETED;
      refund.resolutionMethod = method;
      refund.resolutionNote = note;
      refund.resolvedAt = current;
      await manager.save(refund);
      await this.syncAttemptRefundedState(manager, refund.paymentId);
    });
  }

  private async completeRefundWithWallet(
    id: string,
    buyerId: string,
    amount: number,
  ) {
    await this.db.transaction(async (manager) => {
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      const current = new Date(now);
      const refund = await manager.findOne(PaymentRefund, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!refund || refund.state === PAYMENT_REFUND_STATE.COMPLETED) return;
      await this.walletService.creditLatePaymentRefund(manager, {
        userId: buyerId,
        paymentRefundId: refund.id,
        amount,
        mode: RECONCILIATION_MODE.SIMULATION,
      });
      refund.state = PAYMENT_REFUND_STATE.COMPLETED;
      refund.resolutionMethod = PAYMENT_REFUND_RESOLUTION.WALLET_CREDIT;
      refund.resolutionNote = 'Auto-credited to buyer refund wallet';
      refund.resolvedAt = current;
      await manager.save(refund);
      await this.syncAttemptRefundedState(manager, refund.paymentId);
    });
  }

  private async escalateToReview(id: string) {
    await this.db.transaction(async (manager) => {
      const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
      const current = new Date(now);
      const refund = await manager.findOne(PaymentRefund, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!refund || refund.state === PAYMENT_REFUND_STATE.COMPLETED) {
        return;
      }
      await this.markReviewAlert(manager, refund, current);
    });
  }

  private async markReviewAlert(
    manager: EntityManager,
    refund: PaymentRefund,
    current: Date,
  ) {
    if (!refund.alertedAt) {
      refund.alertedAt = current;
      this.logger.error({
        refundId: refund.id,
        message:
          'Late payment refund requires manual bank transfer or wallet adjustment',
      });
    }
    refund.state = PAYMENT_REFUND_STATE.REVIEW_REQUIRED;
    refund.nextQueryAt = new Date(
      current.getTime() + PAYMENT_REFUND_REVIEW_RETRY_MS,
    );
    await manager.save(refund);
  }

  private async syncAttemptRefundedState(
    manager: EntityManager,
    paymentId: string,
  ) {
    const attempt = await manager.findOne(PaymentAttempt, {
      where: { id: paymentId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!attempt || attempt.state !== PAYMENT_ATTEMPT_STATE.REFUND_REQUIRED) {
      return;
    }
    const refunds = await manager.find(PaymentRefund, {
      where: { paymentId },
    });
    if (
      refunds.length > 0 &&
      refunds.every((row) => row.state === PAYMENT_REFUND_STATE.COMPLETED)
    ) {
      attempt.state = PAYMENT_ATTEMPT_STATE.REFUNDED;
      await manager.save(attempt);
    }
  }
}
