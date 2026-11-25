import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { DataSource, In, LessThanOrEqual } from 'typeorm';
import z from 'zod';

import { vndAmountSchema } from '@/common/schemas/money.schema';
import {
  PayosClient,
  type PayosPaymentResult,
  type PayosWebhookResult,
} from '@/infrastructure/payment/payos.client';
import { FeePaymentCapture } from '@/modules/fees/payments/entities';
import {
  PAYMENT_PROVIDER_OUTCOME,
  PAYOS_STATUS,
} from '@/modules/payment/constants/payment.constant';
import { PaymentAttempt, PaymentRefund } from '@/modules/payment/entities';
import { PAYOS_CLIENT } from '@/modules/payment/payment.config';
import { providerOutcome } from '@/modules/payment/policies/payment.policy';

import {
  EXCESS_PAYMENT_STATE,
  EXCESS_POLICY,
} from '../constants/excess.constant';
import {
  ExcessCapture,
  ExcessPayment,
  ExcessProviderRefund,
} from '../entities';
import {
  excessActor,
  excessClock,
} from '../policies/excess-transaction.policy';
import { excessPaySchema } from '../schemas/excess.schema';
import { ExcessAttemptService } from './excess-attempt.service';
import { allocateExcessCapture } from './excess-capture.policy';
import { ExcessRefundService } from './excess-refund.service';

@Injectable()
export class ExcessPaymentService {
  constructor(
    private readonly db: DataSource,
    @Inject(PAYOS_CLIENT)
    private readonly client: PayosClient | null,
    private readonly attempts: ExcessAttemptService,
    private readonly refunds: ExcessRefundService,
  ) {}

  private gateway() {
    if (!this.client)
      throw new ServiceUnavailableException('PayOS gateway is disabled');
    return this.client;
  }

  async create(actorId: string, input: z.input<typeof excessPaySchema>) {
    const id = await this.attempts.create(actorId, input);
    return this.view(actorId, id);
  }

  handlesOrderCode(providerOrderCode: string) {
    return this.db.getRepository(ExcessPayment).existsBy({ providerOrderCode });
  }

  async view(actorId: string, id: string, admin = false) {
    const manager = this.db.manager;
    await excessActor(manager, actorId, admin);
    const row = await manager.findOneBy(
      ExcessPayment,
      admin ? { id } : { id, buyerId: actorId },
    );
    if (!row) throw new UnauthorizedException();
    const captures = await manager.findBy(ExcessCapture, { paymentId: id });
    const refunds = captures.length
      ? await manager.findBy(ExcessProviderRefund, {
          captureId: In(captures.map((c) => c.id)),
        })
      : [];
    return {
      id: row.id,
      amount: row.amount,
      mode: 'SIMULATION' as const,
      state: row.state,
      payUrl: row.state === EXCESS_PAYMENT_STATE.PENDING ? row.payUrl : null,
      targets: row.targets,
      refunds: refunds.map((r) => ({
        id: r.id,
        amount: r.amount,
        state: r.state,
        alertedAt: r.alertedAt,
        responseDueAt: r.responseDueAt,
      })),
    };
  }

  async webhook(input: unknown) {
    let verified: PayosWebhookResult;
    try {
      verified = await this.gateway().verifyWebhook(input);
    } catch {
      throw new UnauthorizedException('Invalid recovery payment signature');
    }
    if (verified.isTestPing) return;
    await this.applyWebhook(verified);
  }

  async applyWebhook(verified: PayosWebhookResult) {
    if (verified.isTestPing) return;
    const row = await this.db.getRepository(ExcessPayment).findOneBy({
      providerOrderCode: String(verified.orderCode),
    });
    if (!row) {
      throw new UnauthorizedException('Invalid recovery payment reference');
    }
    await this.apply(row.id, {
      orderCode: verified.orderCode,
      status: verified.code === '00' ? PAYOS_STATUS.PAID : PAYOS_STATUS.PENDING,
      amount: verified.amount,
      amountPaid: verified.amount,
      providerTransId: verified.reference || null,
    });
  }

  async apply(id: string, result: PayosPaymentResult) {
    await this.db.transaction(async (manager) => {
      const now = await excessClock(manager);
      const row = await manager.findOne(ExcessPayment, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new NotFoundException('Recovery payment not found');
      if (
        row.providerOrderCode &&
        Number(row.providerOrderCode) !== result.orderCode
      )
        throw new UnauthorizedException('Invalid recovery payment request');
      const outcome = providerOutcome(result.status);
      if (outcome !== PAYMENT_PROVIDER_OUTCOME.PAID) {
        if (
          row.state !== EXCESS_PAYMENT_STATE.SUCCEEDED &&
          outcome === PAYMENT_PROVIDER_OUTCOME.FAILED
        ) {
          row.state = EXCESS_PAYMENT_STATE.FAILED;
          row.payUrl = null;
          await manager.save(row);
        }
        return;
      }
      const providerTransId = result.providerTransId?.trim() || '';
      const validCapture =
        providerTransId.length > 0 &&
        vndAmountSchema.safeParse(result.amountPaid).success &&
        result.amountPaid > 0;
      if (!validCapture)
        throw new ConflictException('Invalid recovery capture');
      const reused =
        (await manager.existsBy(PaymentAttempt, { providerTransId })) ||
        (await manager.existsBy(PaymentRefund, { providerTransId })) ||
        (await manager.existsBy(FeePaymentCapture, { providerTransId }));
      if (reused)
        throw new ConflictException(
          'Capture belongs to another payment source',
        );
      const prior = await manager.findOneBy(ExcessCapture, { providerTransId });
      if (prior) {
        if (prior.paymentId !== row.id || prior.amount !== result.amountPaid)
          throw new ConflictException('Recovery capture reused');
        return;
      }
      const capture = await manager.save(
        ExcessCapture,
        manager.create(ExcessCapture, {
          paymentId: row.id,
          providerTransId,
          amount: result.amountPaid,
          allocated: 0,
          reservations: [],
        }),
      );
      await allocateExcessCapture(manager, row, capture, now);
    });
  }

  async query(id: string) {
    const gateway = this.gateway();
    const orderCode = await this.db.transaction(async (manager) => {
      const now = await excessClock(manager);
      const row = await manager.findOne(ExcessPayment, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !row ||
        !row.providerOrderCode ||
        row.state === EXCESS_PAYMENT_STATE.SUCCEEDED ||
        row.nextQueryAt > now
      )
        return null;
      row.nextQueryAt = new Date(now.getTime() + EXCESS_POLICY.LEASE_MS);
      await manager.save(row);
      return Number(row.providerOrderCode);
    });
    if (orderCode) {
      try {
        await this.apply(id, await gateway.getPaymentLink(orderCode));
      } catch {
        /* Persisted lease preserves unresolved state. */
      }
    }
  }

  async run() {
    if (!this.client) return;
    const rows = await this.db.getRepository(ExcessPayment).find({
      where: {
        state: In([
          EXCESS_PAYMENT_STATE.CREATING,
          EXCESS_PAYMENT_STATE.PENDING,
          EXCESS_PAYMENT_STATE.UNKNOWN,
          EXCESS_PAYMENT_STATE.FAILED,
        ]),
        nextQueryAt: LessThanOrEqual(new Date()),
      },
      take: EXCESS_POLICY.BATCH,
      order: { nextQueryAt: 'ASC', id: 'ASC' },
    });
    for (const row of rows) await this.query(row.id);
    await this.refunds.run();
  }
}
