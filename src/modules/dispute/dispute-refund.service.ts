import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { Order } from '@/modules/order/entities';
import { OrderAccess } from '@/modules/order/order.access';

import {
  DISPUTE_ACTION,
  DISPUTE_DECISION_OUTCOME,
  DISPUTE_ISSUE_STATE,
  DISPUTE_PARTY,
} from './constants/dispute.constant';
import {
  REFUND_EXECUTION_POLICY as POLICY,
  REFUND_BLOCK,
  REFUND_STATE,
} from './constants/refund-execution.constant';
import { DISPUTE_REFUND_CONDITION as CONDITION } from './constants/refund.constant';
import { executeDisputeRefund } from './dispute-refund-execution';
import { refundFunding } from './dispute-refund-funding';
import { queueDisputeRefund } from './dispute-refund.lifecycle';
import { DisputeAccess } from './dispute.access';
import { notifyDispute, recordDisputeAction } from './dispute.lifecycle';
import { DisputeFinalDecision } from './entities/dispute-appeal.entity';
import { DisputeDecision } from './entities/dispute-decision.entity';
import {
  DisputeRefund,
  DisputeRefundConsent,
} from './entities/dispute-refund.entity';
import { DisputeIssue } from './entities/dispute.entity';
import { assertDisputeRefundPlan } from './policies/dispute-refund-plan.policy';
import {
  exactRefundPlanToken,
  resolveRefundCondition,
} from './returns/refund-condition.integration';
import { closeExpiredReturnRefund } from './returns/refund-return.integration';
import type { ReturnGate } from './returns/types/return.type';
import { refundConsentSchema } from './schemas/refund-execution.schema';

@Injectable()
export class DisputeRefundService {
  private readonly logger = new Logger(DisputeRefundService.name);
  private cursor: string | undefined;
  constructor(private readonly db: DataSource) {}

  planToken(final: DisputeFinalDecision) {
    return exactRefundPlanToken(final);
  }
  private async lock(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }
  async refresh(finalId: string) {
    const prepared = await this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const context = await this.prepare(manager, finalId, now);
      if (context.refund)
        await this.alertOverdue(
          manager,
          context.refund,
          context.final.issueId,
          now,
        );
      return context.refund;
    });
    if (
      !prepared ||
      prepared.status !== REFUND_STATE.PENDING ||
      prepared.blockedReason
    )
      return prepared;
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const { refund, final, issue, order, funding } = await this.prepare(
        manager,
        finalId,
        now,
      );
      if (
        !refund ||
        refund.status !== REFUND_STATE.PENDING ||
        refund.blockedReason ||
        !funding
      )
        return refund;
      return executeDisputeRefund(
        manager,
        refund,
        final,
        issue,
        order,
        funding,
        now,
      );
    });
  }
  private async prepare(manager: EntityManager, finalId: string, now: Date) {
    const final = await manager.findOneByOrFail(DisputeFinalDecision, {
      id: finalId,
    });
    const refund = await queueDisputeRefund(manager, final);
    const issue = await manager.findOneByOrFail(DisputeIssue, {
      id: final.issueId,
    });
    const order = await manager.findOneByOrFail(Order, {
      id: refund?.orderId ?? final.remedyKey.split(':')[0],
    });
    let funding: Awaited<ReturnType<typeof refundFunding>> = null;
    let gate: ReturnGate | null = null;
    let carrierMode: string | null = null;
    const context = () => ({ final, refund, issue, order, funding });
    if (!refund || refund.status !== REFUND_STATE.PENDING) return context();
    const plan = final.refundPlan;
    refund.blockedReason = null;
    if (!plan) refund.blockedReason = REFUND_BLOCK.PLAN_MISSING;
    else {
      assertDisputeRefundPlan(issue.kind, final.outcome, final.itemPrice, plan);
      const initial = await manager.findOneByOrFail(DisputeDecision, {
        id: final.decisionId,
      });
      const item = order.items.find(
        (item) => item.productId === issue.productId,
      );
      const snapshotMatches =
        item?.price === final.itemPrice &&
        final.remedyKey === `${order.id}:${issue.productId}` &&
        refund.buyerId === order.buyerId &&
        refund.shopId === order.shopId &&
        initial.basis.commissionBasisPoints === order.commissionBasisPoints &&
        issue.status === DISPUTE_ISSUE_STATE.AWAITING_EXECUTION;
      if (!snapshotMatches) refund.blockedReason = REFUND_BLOCK.SOURCE_REVIEW;
      else {
        const condition = await resolveRefundCondition(manager, final, now);
        gate = condition.gate;
        carrierMode = condition.carrierMode;
        refund.blockedReason = condition.blockedReason;
        if (!refund.blockedReason && gate?.status === 'CLOSED') {
          await closeExpiredReturnRefund(manager, refund, final, issue, now);
          return context();
        }
        if (
          !refund.blockedReason &&
          gate?.status === 'READY' &&
          gate.amount === 0
        ) {
          await closeExpiredReturnRefund(
            manager,
            refund,
            final,
            issue,
            now,
            'Verified per-item buyer fault leaves no eligible unexecuted refund; no wallet money credited or recovered',
            DISPUTE_ACTION.RETURN_CLOSED_NO_REFUND,
          );
          return context();
        }
        refund.executionAmount = gate?.amount ?? plan.amount;
      }
      if (!refund.blockedReason) {
        funding = await refundFunding(manager, order, now);
        if (!funding) refund.blockedReason = REFUND_BLOCK.PAYMENT_UNVERIFIED;
        else if (
          (gate?.mode && gate.mode !== funding.mode) ||
          (carrierMode && carrierMode !== funding.mode)
        ) {
          refund.blockedReason = REFUND_BLOCK.SOURCE_REVIEW;
          funding = null;
        }
      }
    }
    if (funding) {
      refund.mode = funding.mode;
      const consents = await manager.find(DisputeRefundConsent, {
        where: { finalDecisionId: final.id },
      });
      const start = Math.max(
        final.finalizedAt.getTime(),
        funding.verifiedAt.getTime(),
        gate?.at?.getTime() ?? 0,
        ...consents
          .filter(
            (c) =>
              final.refundPlan?.condition === CONDITION.PARTIAL_AGREEMENT ||
              c.party === DISPUTE_PARTY.SELLER,
          )
          .map((c) => c.createdAt.getTime()),
      );
      refund.eligibleAt ??= new Date(start);
      refund.dueAt ??= new Date(start + POLICY.SLA_MS);
    }
    await manager.save(refund);
    return context();
  }

  async consent(userId: string, finalId: string, input: { planToken: string }) {
    const data = refundConsentSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const final = await manager.findOneByOrFail(DisputeFinalDecision, {
        id: finalId,
      });
      const refund = await queueDisputeRefund(manager, final);
      if (!refund) throw new ConflictException('No refund entitlement');
      const { party } = await new DisputeAccess(new OrderAccess()).assertParty(
        manager,
        userId,
        refund.orderId,
      );
      const condition = final.refundPlan?.condition;
      const acceptsAgreement =
        condition === CONDITION.PARTIAL_AGREEMENT ||
        condition === CONDITION.SELLER_WAIVER;
      if (!acceptsAgreement)
        throw new ConflictException(
          'This remedy does not accept party consent',
        );
      if (data.planToken !== this.planToken(final))
        throw new ConflictException(
          'Refund plan changed; reload exact amount and seller debit',
        );
      const replay = await manager.findOneBy(DisputeRefundConsent, {
        finalDecisionId: finalId,
        party,
      });
      if (replay) return refund;
      if (refund.status !== REFUND_STATE.PENDING)
        throw new ConflictException('Refund already executed');
      await manager.save(
        DisputeRefundConsent,
        manager.create(DisputeRefundConsent, {
          finalDecisionId: finalId,
          party,
          actorId: userId,
          planFingerprint: data.planToken,
          createdAt: now,
        }),
      );
      await recordDisputeAction(
        manager,
        final.issueId,
        DISPUTE_ACTION.REFUND_CONSENT,
        userId,
        now,
      );
      await notifyDispute(
        manager,
        final.issueId,
        DISPUTE_ACTION.REFUND_CONSENT,
        now,
        'Party accepted the exact refund plan; execution waits for all prerequisites',
        party,
      );
      return refund;
    });
  }
  private async alertOverdue(
    manager: EntityManager,
    refund: DisputeRefund,
    issueId: string,
    now: Date,
  ) {
    const overdue =
      refund.status !== REFUND_STATE.SUCCEEDED &&
      refund.dueAt &&
      now > refund.dueAt &&
      !refund.alertedAt;
    if (!overdue) return;
    refund.alertedAt = now;
    refund.responseDueAt = new Date(
      now.getTime() + POLICY.INCIDENT_RESPONSE_MS,
    );
    await manager.save(refund);
    await recordDisputeAction(
      manager,
      issueId,
      DISPUTE_ACTION.REFUND_OVERDUE,
      null,
      now,
    );
    await notifyDispute(
      manager,
      issueId,
      DISPUTE_ACTION.REFUND_OVERDUE,
      now,
      'Wallet refund overdue; automatic recovery continues; Admin response due in four continuous hours',
    );
  }
  async run() {
    const query = this.db.manager
      .createQueryBuilder(DisputeFinalDecision, 'final')
      .leftJoin(DisputeRefund, 'refund', 'refund.finalDecisionId = final.id')
      .where('final.outcome != :rejected', {
        rejected: DISPUTE_DECISION_OUTCOME.REJECT_CLAIM,
      })
      .andWhere('(refund.id IS NULL OR refund.status = :pending)', {
        pending: REFUND_STATE.PENDING,
      })
      .select('final.id', 'id')
      .orderBy('final.id', 'ASC')
      .limit(POLICY.BATCH_SIZE);
    if (this.cursor)
      query.andWhere('final.id > :cursor', { cursor: this.cursor });
    const rows = await query.getRawMany<{ id: string }>();
    for (const row of rows) {
      this.cursor = row.id;
      try {
        await this.refresh(row.id);
      } catch {
        this.logger.error({
          finalDecisionId: row.id,
          message: 'Refund transaction failed; safe retry required',
        });
      }
    }
    if (rows.length < POLICY.BATCH_SIZE) this.cursor = undefined;
  }
}
