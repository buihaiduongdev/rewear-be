import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { Order } from '@/modules/order/entities/order.entity';
import { OrderAccess } from '@/modules/order/order.access';

import {
  DISPUTE_ACTION,
  DISPUTE_DECISION_OUTCOME,
  DISPUTE_ISSUE_STATE,
  DISPUTE_PARTY,
  DISPUTE_RESPONSIBILITY,
} from './constants/dispute.constant';
import {
  REFUND_EXECUTION_POLICY as POLICY,
  REFUND_BLOCK,
  REFUND_STATE,
} from './constants/refund-execution.constant';
import { DISPUTE_REFUND_CONDITION as CONDITION } from './constants/refund.constant';
import { decisionFingerprint } from './dispute-decision-review';
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
import { refundConsentSchema } from './schemas/refund-execution.schema';

@Injectable()
export class DisputeRefundService {
  private readonly logger = new Logger(DisputeRefundService.name);
  private cursor: string | undefined;
  constructor(private readonly db: DataSource) {}

  planToken(final: DisputeFinalDecision) {
    return decisionFingerprint({
      id: final.id,
      remedyKey: final.remedyKey,
      refundPlan: final.refundPlan,
    });
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
      prepared.status === REFUND_STATE.SUCCEEDED ||
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
        refund.status === REFUND_STATE.SUCCEEDED ||
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
    const context = () => ({ final, refund, issue, order, funding });
    if (!refund || refund.status === REFUND_STATE.SUCCEEDED) return context();
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
      else if (final.responsibility !== DISPUTE_RESPONSIBILITY.SELLER)
        refund.blockedReason = REFUND_BLOCK.LIABILITY_REVIEW;
      else refund.blockedReason = await this.conditionBlock(manager, final);
      if (!refund.blockedReason) {
        funding = await refundFunding(manager, order, now);
        if (!funding) refund.blockedReason = REFUND_BLOCK.PAYMENT_UNVERIFIED;
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
  private async conditionBlock(
    manager: EntityManager,
    final: DisputeFinalDecision,
  ) {
    const condition = final.refundPlan!.condition;
    if (condition === CONDITION.MISSING_ITEM) return null;
    const needsConsent =
      condition === CONDITION.PARTIAL_AGREEMENT ||
      condition === CONDITION.SELLER_WAIVER;
    if (!needsConsent) return REFUND_BLOCK.CONDITIONS_PENDING;
    const consents = await manager.find(DisputeRefundConsent, {
      where: {
        finalDecisionId: final.id,
        planFingerprint: this.planToken(final),
      },
    });
    const agreed = new Set(consents.map((row) => row.party));
    const consentSatisfied =
      agreed.has(DISPUTE_PARTY.SELLER) &&
      (condition === CONDITION.SELLER_WAIVER ||
        agreed.has(DISPUTE_PARTY.BUYER));
    return consentSatisfied ? null : REFUND_BLOCK.CONSENT_PENDING;
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
      if (refund.status === REFUND_STATE.SUCCEEDED)
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
