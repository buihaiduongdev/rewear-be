import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { DataSource, In, LessThanOrEqual } from 'typeorm';
import z from 'zod';

import { vndAmountSchema } from '@/common/schemas/money.schema';
import {
  type MomoNotification,
  type MomoResult,
  MomoSandboxClient,
} from '@/infrastructure/payment/momo-sandbox.client';
import { FeePaymentCapture } from '@/modules/fees/payments/entities/fee-payment.entity';
import {
  PAYMENT_PROVIDER_OUTCOME,
  PAYMENT_PROVIDER_SUCCESS_CODE,
} from '@/modules/payment/constants/payment.constant';
import {
  PaymentAttempt,
  PaymentRefund,
} from '@/modules/payment/entities/payment.entity';
import { providerOutcome } from '@/modules/payment/policies/payment.policy';

import {
  EXCESS_MOMO_CLIENT,
  EXCESS_PAYMENT_PREFIX,
  EXCESS_PAYMENT_STATE,
  EXCESS_POLICY,
} from '../constants/excess.constant';
import {
  ExcessCapture,
  ExcessPayment,
  ExcessProviderRefund,
} from '../entities/excess.entity';
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
    @Inject(EXCESS_MOMO_CLIENT)
    private readonly client: MomoSandboxClient | null,
    private readonly attempts: ExcessAttemptService,
    private readonly refunds: ExcessRefundService,
  ) {}
  private gateway() {
    if (!this.client)
      throw new ServiceUnavailableException('MoMo Sandbox is disabled');
    return this.client;
  }
  async create(actorId: string, input: z.input<typeof excessPaySchema>) {
    const id = await this.attempts.create(actorId, input);
    return this.view(actorId, id);
  }
  handles(id: string) {
    return this.db.getRepository(ExcessPayment).existsBy({ id });
  }
  view(actorId: string, id: string, admin = false) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
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
    });
  }
  async ipn(input: MomoNotification) {
    let result: MomoNotification;
    try {
      result = this.gateway().verifyIpn(input);
    } catch {
      throw new UnauthorizedException('Invalid recovery payment signature');
    }
    const valid =
      result.orderType === 'momo_wallet' &&
      result.requestId === result.orderId &&
      result.orderInfo === EXCESS_PAYMENT_PREFIX + result.orderId;
    if (!valid)
      throw new UnauthorizedException('Invalid recovery payment reference');
    await this.apply(result);
  }
  async apply(result: MomoResult) {
    await this.db.transaction(async (manager) => {
      const now = await excessClock(manager);
      const row = await manager.findOneByOrFail(ExcessPayment, {
        id: result.orderId,
      });
      if (result.requestId !== row.id)
        throw new UnauthorizedException('Invalid recovery payment request');
      if (result.resultCode !== PAYMENT_PROVIDER_SUCCESS_CODE) {
        if (
          row.state !== EXCESS_PAYMENT_STATE.SUCCEEDED &&
          providerOutcome(result.resultCode) === PAYMENT_PROVIDER_OUTCOME.FAILED
        ) {
          row.state = EXCESS_PAYMENT_STATE.FAILED;
          row.payUrl = null;
          await manager.save(row);
        }
        return;
      }
      const validCapture =
        Number.isSafeInteger(result.transId) &&
        result.transId > 0 &&
        vndAmountSchema.safeParse(result.amount).success &&
        result.amount > 0;
      if (!validCapture)
        throw new ConflictException('Invalid recovery capture');
      const providerTransId = String(result.transId);
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
        if (prior.paymentId !== row.id || prior.amount !== result.amount)
          throw new ConflictException('Recovery capture reused');
        return;
      }
      const capture = await manager.save(
        ExcessCapture,
        manager.create(ExcessCapture, {
          paymentId: row.id,
          providerTransId,
          amount: result.amount,
          allocated: 0,
          reservations: [],
        }),
      );
      await allocateExcessCapture(manager, row, capture, now);
    });
  }
  async query(id: string) {
    const gateway = this.gateway();
    const row = await this.db.transaction(async (manager) => {
      const now = await excessClock(manager);
      const row = await manager.findOneByOrFail(ExcessPayment, { id });
      if (row.state === EXCESS_PAYMENT_STATE.SUCCEEDED || row.nextQueryAt > now)
        return null;
      row.nextQueryAt = new Date(now.getTime() + EXCESS_POLICY.LEASE_MS);
      await manager.save(row);
      return row;
    });
    if (row)
      try {
        await this.apply(await gateway.query(id, id));
      } catch {
        /* Persisted lease preserves unresolved state. */
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
