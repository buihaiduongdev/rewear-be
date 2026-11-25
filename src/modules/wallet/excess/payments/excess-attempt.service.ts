import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { DataSource, In } from 'typeorm';
import z from 'zod';

import {
  generatePayosOrderCode,
  PayosClient,
} from '@/infrastructure/payment/payos.client';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import {
  PAYMENT_MAX_AMOUNT,
  PAYMENT_MIN_AMOUNT,
  PAYMENT_PROVIDER_OUTCOME,
  PAYOS_STATUS,
} from '@/modules/payment/constants/payment.constant';
import { PAYOS_CLIENT } from '@/modules/payment/payment.config';
import { providerOutcome } from '@/modules/payment/policies/payment.policy';

import {
  EXCESS_PAYMENT_PREFIX,
  EXCESS_PAYMENT_STATE,
  EXCESS_POLICY,
  EXCESS_REVIEW,
} from '../constants/excess.constant';
import { ExcessPayment } from '../entities';
import { excessTotals } from '../policies/excess-accounting.policy';
import {
  excessAccess,
  excessActor,
  excessClock,
  excessFingerprint,
} from '../policies/excess-transaction.policy';
import { excessPaySchema } from '../schemas/excess.schema';

@Injectable()
export class ExcessAttemptService {
  constructor(
    private readonly db: DataSource,
    @Inject(PAYOS_CLIENT)
    private readonly client: PayosClient | null,
  ) {}

  async create(actorId: string, input: z.input<typeof excessPaySchema>) {
    const data = excessPaySchema.parse(input);
    const gateway = this.client;
    if (!gateway)
      throw new ServiceUnavailableException('PayOS gateway is disabled');
    const prepared = await this.db.transaction(async (manager) => {
      const now = await excessClock(manager);
      await excessActor(manager, actorId);
      const fingerprint = excessFingerprint({
        ids: [...data.excessIds].sort(),
        amount: data.amount,
      });
      const prior = await manager.findOneBy(ExcessPayment, {
        buyerId: actorId,
        requestId: data.requestId,
      });
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw new ConflictException('Recovery payment payload changed');
        return { row: prior, send: false };
      }
      if (data.amount < PAYMENT_MIN_AMOUNT || data.amount > PAYMENT_MAX_AMOUNT)
        throw new ConflictException(
          'Recovery total outside PayOS amount range',
        );
      const pending = await manager.findBy(ExcessPayment, {
        buyerId: actorId,
        state: In([
          EXCESS_PAYMENT_STATE.CREATING,
          EXCESS_PAYMENT_STATE.PENDING,
          EXCESS_PAYMENT_STATE.UNKNOWN,
        ]),
      });
      const overlap = pending.some((p) =>
        p.targets.some((t) => data.excessIds.includes(t.excessId)),
      );
      if (overlap)
        throw new ConflictException('Recovery has an unresolved payment');
      const targets = [];
      for (const id of data.excessIds) {
        const row = await excessAccess(manager, actorId, id);
        const amount = (await excessTotals(manager, row)).outstanding;
        const unavailable =
          row.mode !== RECONCILIATION_MODE.SIMULATION ||
          row.reviewState === EXCESS_REVIEW.OPEN ||
          amount <= 0;
        if (unavailable)
          throw new ConflictException('Recovery not payable through PayOS');
        targets.push({ excessId: id, amount });
      }
      if (targets.reduce((n, t) => n + t.amount, 0) !== data.amount)
        throw new ConflictException('Recovery payment amount changed');
      const row = await manager.save(
        ExcessPayment,
        manager.create(ExcessPayment, {
          buyerId: actorId,
          requestId: data.requestId,
          providerOrderCode: String(generatePayosOrderCode()),
          fingerprint,
          targets,
          amount: data.amount,
          state: EXCESS_PAYMENT_STATE.CREATING,
          payUrl: null,
          nextQueryAt: new Date(now.getTime() + EXCESS_POLICY.LEASE_MS),
        }),
      );
      return { row, send: true };
    });
    if (prepared.send) await this.send(prepared.row, gateway);
    return prepared.row.id;
  }

  private async send(payment: ExcessPayment, gateway: PayosClient) {
    try {
      const result = await gateway.createPaymentLink({
        orderCode: Number(payment.providerOrderCode),
        amount: payment.amount,
        description:
          EXCESS_PAYMENT_PREFIX + payment.id.slice(0, 8).toUpperCase(),
        expiredAt: Math.floor(
          (payment.createdAt.getTime() + EXCESS_POLICY.LINK_TTL_MS) / 1000,
        ),
      });
      await this.db.transaction(async (manager) => {
        const row = await manager.findOneOrFail(ExcessPayment, {
          where: { id: payment.id },
          lock: { mode: 'pessimistic_write' },
        });
        // A concurrent callback/query has stronger evidence than create response.
        if (row.state !== EXCESS_PAYMENT_STATE.CREATING) return;
        const outcome = providerOutcome(result.status);
        row.state =
          result.status === PAYOS_STATUS.PENDING ||
          outcome === PAYMENT_PROVIDER_OUTCOME.PAID
            ? EXCESS_PAYMENT_STATE.PENDING
            : outcome === PAYMENT_PROVIDER_OUTCOME.FAILED
              ? EXCESS_PAYMENT_STATE.FAILED
              : EXCESS_PAYMENT_STATE.UNKNOWN;
        row.payUrl =
          row.state === EXCESS_PAYMENT_STATE.PENDING
            ? (result.checkoutUrl ?? null)
            : null;
        await manager.save(row);
      });
    } catch {
      await this.db
        .getRepository(ExcessPayment)
        .update(
          { id: payment.id, state: EXCESS_PAYMENT_STATE.CREATING },
          { state: EXCESS_PAYMENT_STATE.UNKNOWN },
        );
    }
  }
}
