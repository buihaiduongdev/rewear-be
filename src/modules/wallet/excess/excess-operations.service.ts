import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, Not } from 'typeorm';
import z from 'zod';

import { fulfillmentDeadline } from '@/modules/shipment/utils/fulfillment-calendar';

import {
  EXCESS_EVENT,
  EXCESS_PAYMENT_STATE,
  EXCESS_POLICY,
  EXCESS_REVIEW,
} from './constants/excess.constant';
import {
  ExcessCapture,
  ExcessPayment,
  ExcessProviderRefund,
  WalletExcess,
} from './entities/excess.entity';
import { excessEvent } from './excess.lifecycle';
import { settleExcessReservations } from './payments/settle-excess-reservations';
import {
  excessAccess,
  excessActor,
  excessClock,
  excessReplay,
  saveExcessCommand,
} from './policies/excess-transaction.policy';
import {
  excessIncidentSchema,
  excessObjectSchema,
  excessResponseSchema,
  excessWithdrawSchema,
} from './schemas/excess.schema';

@Injectable()
export class ExcessOperationsService {
  constructor(private readonly db: DataSource) {}
  withdraw(
    actorId: string,
    id: string,
    input: z.input<typeof excessWithdrawSchema>,
  ) {
    const data = excessWithdrawSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await excessClock(manager);
      const row = await excessAccess(manager, actorId, id);
      const payload = { action: EXCESS_EVENT.WITHDRAW, id, data };
      if (await excessReplay(manager, actorId, data.requestId, payload))
        return { id: row.id, version: row.version };
      if (row.reviewState !== EXCESS_REVIEW.OPEN)
        throw new ConflictException('No open recovery objection');
      row.reviewState = EXCESS_REVIEW.CLOSED;
      row.supplementRequest = null;
      row.version++;
      await manager.save(row);
      await settleExcessReservations(manager, row, now);
      await excessEvent(
        manager,
        row,
        actorId,
        EXCESS_EVENT.WITHDRAWN,
        'Buyer explicitly withdrew recovery objection',
      );
      await saveExcessCommand(manager, actorId, data.requestId, id, payload);
      return { id: row.id, version: row.version };
    });
  }
  requestEvidence(
    actorId: string,
    id: string,
    input: z.input<typeof excessResponseSchema>,
  ) {
    const data = excessResponseSchema.parse(input);
    return this.db.transaction(async (manager) => {
      await excessClock(manager);
      const row = await excessAccess(manager, actorId, id, true);
      const payload = { action: EXCESS_EVENT.REQUEST_EVIDENCE, id, data };
      if (await excessReplay(manager, actorId, data.requestId, payload))
        return { id: row.id, version: row.version };
      if (row.reviewState !== EXCESS_REVIEW.OPEN)
        throw new ConflictException('No open recovery objection');
      row.supplementRequest = data.message;
      row.version++;
      await manager.save(row);
      await excessEvent(
        manager,
        row,
        actorId,
        EXCESS_EVENT.EVIDENCE_REQUESTED,
        data.message,
      );
      await saveExcessCommand(manager, actorId, data.requestId, id, payload);
      return { id: row.id, version: row.version };
    });
  }
  supplement(
    actorId: string,
    id: string,
    input: z.input<typeof excessObjectSchema>,
  ) {
    const data = excessObjectSchema.parse(input);
    return this.db.transaction(async (manager) => {
      await excessClock(manager);
      const row = await excessAccess(manager, actorId, id);
      const payload = { action: EXCESS_EVENT.SUPPLEMENT, id, data };
      if (await excessReplay(manager, actorId, data.requestId, payload))
        return { id: row.id, version: row.version };
      if (row.reviewState !== EXCESS_REVIEW.OPEN || !row.supplementRequest)
        throw new ConflictException('No requested recovery evidence');
      row.supplementRequest = null;
      row.version++;
      await manager.save(row);
      await excessEvent(
        manager,
        row,
        actorId,
        EXCESS_EVENT.SUPPLEMENTED,
        data.reason,
        {
          evidence: data.evidence,
        },
      );
      await saveExcessCommand(manager, actorId, data.requestId, id, payload);
      return { id: row.id, version: row.version };
    });
  }
  respond(
    actorId: string,
    id: string,
    input: z.input<typeof excessIncidentSchema>,
  ) {
    const data = excessIncidentSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await excessClock(manager);
      const row = await excessAccess(manager, actorId, id, true);
      const payload = { action: EXCESS_EVENT.ADMIN_RESPONSE, id, data };
      if (await excessReplay(manager, actorId, data.requestId, payload))
        return { id: row.id };
      if (new Date(data.nextUpdateAt) <= now)
        throw new ConflictException('Next update must be in the future');
      await excessEvent(
        manager,
        row,
        actorId,
        EXCESS_EVENT.ADMIN_RESPONSE,
        data.message,
        { receivedBy: actorId, nextUpdateAt: data.nextUpdateAt },
      );
      await saveExcessCommand(manager, actorId, data.requestId, id, payload);
      return { id: row.id };
    });
  }
  refundQueue(actorId: string) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      await excessActor(manager, actorId, true);
      return manager.find(ExcessProviderRefund, {
        where: { state: Not(EXCESS_PAYMENT_STATE.SUCCEEDED) },
        order: { nextQueryAt: 'ASC', id: 'ASC' },
        take: EXCESS_POLICY.BATCH,
      });
    });
  }
  respondRefund(
    actorId: string,
    id: string,
    input: z.input<typeof excessIncidentSchema>,
  ) {
    const data = excessIncidentSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await excessClock(manager);
      await excessActor(manager, actorId, true);
      const refund = await manager.findOneByOrFail(ExcessProviderRefund, {
        id,
      });
      const capture = await manager.findOneByOrFail(ExcessCapture, {
        id: refund.captureId,
      });
      const payment = await manager.findOneByOrFail(ExcessPayment, {
        id: capture.paymentId,
      });
      const payload = { action: EXCESS_EVENT.REFUND_RESPONSE, id, data };
      if (await excessReplay(manager, actorId, data.requestId, payload))
        return { id };
      if (new Date(data.nextUpdateAt) <= now)
        throw new ConflictException('Next update must be in the future');
      const row = await manager.findOneByOrFail(WalletExcess, {
        id: payment.targets[0].excessId,
      });
      await excessEvent(
        manager,
        row,
        actorId,
        EXCESS_EVENT.ADMIN_RESPONSE,
        data.message,
        { refundId: id, receivedBy: actorId, nextUpdateAt: data.nextUpdateAt },
      );
      await saveExcessCommand(
        manager,
        actorId,
        data.requestId,
        row.id,
        payload,
      );
      return { id };
    });
  }
  async run() {
    return this.db.transaction(async (manager) => {
      const now = await excessClock(manager);
      const rows = await manager
        .createQueryBuilder(WalletExcess, 'r')
        .where('r.reviewState = :open', { open: EXCESS_REVIEW.OPEN })
        .andWhere(
          '(r.reviewDueAt IS NULL OR r.reviewOverdueAt IS NULL OR r.responseDueAt IS NULL)',
        )
        .orderBy('r.objectedAt', 'ASC')
        .addOrderBy('r.id', 'ASC')
        .take(EXCESS_POLICY.BATCH)
        .getMany();
      for (const row of rows) {
        row.reviewDueAt ??= await fulfillmentDeadline(
          manager,
          row.objectedAt!,
          EXCESS_POLICY.REVIEW_BUSINESS_DAYS,
        );
        if (row.reviewDueAt && row.reviewDueAt < now && !row.reviewOverdueAt) {
          row.reviewOverdueAt = now;
          await excessEvent(
            manager,
            row,
            null,
            EXCESS_EVENT.REVIEW_OVERDUE,
            'Recovery objection review is overdue; collection remains paused',
          );
        }
        if (row.reviewOverdueAt && !row.responseDueAt)
          row.responseDueAt = await fulfillmentDeadline(
            manager,
            row.reviewOverdueAt,
            EXCESS_POLICY.RESPONSE_BUSINESS_DAYS,
          );
        await manager.save(row);
      }
    });
  }
}
