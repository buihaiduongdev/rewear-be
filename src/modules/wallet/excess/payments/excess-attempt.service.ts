import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { DataSource, In } from 'typeorm';
import z from 'zod';

import { MomoSandboxClient } from '@/infrastructure/payment/momo-sandbox.client';
import { RECONCILIATION_MODE } from '@/modules/cod-reconciliation/constants/cod-reconciliation.constant';
import {
  PAYMENT_MAX_AMOUNT,
  PAYMENT_MIN_AMOUNT,
  PAYMENT_PROVIDER_OUTCOME,
} from '@/modules/payment/constants/payment.constant';
import { providerOutcome } from '@/modules/payment/policies/payment.policy';

import {
  EXCESS_MOMO_CLIENT,
  EXCESS_PAYMENT_PREFIX,
  EXCESS_PAYMENT_STATE,
  EXCESS_POLICY,
  EXCESS_REVIEW,
} from '../constants/excess.constant';
import { ExcessPayment } from '../entities/excess.entity';
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
    @Inject(EXCESS_MOMO_CLIENT)
    private readonly client: MomoSandboxClient | null,
  ) {}
  async create(actorId: string, input: z.input<typeof excessPaySchema>) {
    const data = excessPaySchema.parse(input);
    const gateway = this.client;
    if (!gateway)
      throw new ServiceUnavailableException('MoMo Sandbox is disabled');
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
        throw new ConflictException('Recovery total outside MoMo amount range');
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
          throw new ConflictException('Recovery not payable through Sandbox');
        targets.push({ excessId: id, amount });
      }
      if (targets.reduce((n, t) => n + t.amount, 0) !== data.amount)
        throw new ConflictException('Recovery payment amount changed');
      const row = await manager.save(
        ExcessPayment,
        manager.create(ExcessPayment, {
          buyerId: actorId,
          requestId: data.requestId,
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
  private async send(payment: ExcessPayment, gateway: MomoSandboxClient) {
    try {
      const result = await gateway.create({
        orderId: payment.id,
        requestId: payment.id,
        amount: payment.amount,
        orderInfo: EXCESS_PAYMENT_PREFIX + payment.id,
      });
      await this.db.transaction(async (manager) => {
        await excessClock(manager);
        const row = await manager.findOneByOrFail(ExcessPayment, {
          id: payment.id,
        });
        // A concurrent callback/query has stronger evidence than create response.
        if (row.state !== EXCESS_PAYMENT_STATE.CREATING) return;
        const outcome = providerOutcome(result.resultCode);
        row.state =
          outcome === PAYMENT_PROVIDER_OUTCOME.PAID
            ? EXCESS_PAYMENT_STATE.PENDING
            : outcome === PAYMENT_PROVIDER_OUTCOME.FAILED
              ? EXCESS_PAYMENT_STATE.FAILED
              : EXCESS_PAYMENT_STATE.UNKNOWN;
        row.payUrl =
          row.state === EXCESS_PAYMENT_STATE.PENDING
            ? (result.payUrl ?? null)
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
