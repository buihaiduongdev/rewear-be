import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { DataSource, EntityManager, In, Not } from 'typeorm';

import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxService } from '@/modules/event/outbox.service';
import { ORDER_STATUS } from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities';
import { ShopSettlement } from '@/modules/shop-finance/entities/shop-settlement.entity';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import {
  businessDeadline,
  DISPUTE_CASE_STATE,
  DISPUTE_DECISION_OUTCOME,
  DISPUTE_ISSUE_STATE,
  DISPUTE_KIND,
  DISPUTE_PARTY,
  DISPUTE_POLICY,
  DISPUTE_RESPONSIBILITY,
} from './constants/dispute.constant';
import { DisputeRefundService } from './dispute-refund.service';
import { DisputeReturnService } from './dispute-return.service';
import {
  assertDisputeParty,
  restoreDisputeCaseIfClear,
} from './dispute.service';
import { DisputeAppeal } from './entities/dispute-appeal.entity';
import { DisputeCase } from './entities/dispute-case.entity';
import { DisputeDecision } from './entities/dispute-decision.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
import { DisputeIssue } from './entities/dispute-issue.entity';
import { DisputeMessage } from './entities/dispute-message.entity';
import type {
  DisputeAppealInput,
  DisputeDecisionInput,
  DisputeDecisionOutcome,
  DisputeKind,
  DisputeResponsibility,
} from './schemas/dispute.schema';
import {
  disputeAppealInputSchema,
  disputeDecisionInputSchema,
  disputeExtensionSchema,
} from './schemas/dispute.schema';

export function resolveDecisionRefundAmount(
  kind: DisputeKind,
  outcome: DisputeDecisionOutcome,
  responsibility: DisputeResponsibility,
  itemPrice: number,
  requestedAmount?: number | null,
): number | null {
  if (!Number.isSafeInteger(itemPrice) || itemPrice <= 0) {
    throw new ConflictException('Invalid snapshotted item price');
  }
  if (outcome === DISPUTE_DECISION_OUTCOME.REJECT_CLAIM) {
    if (requestedAmount != null) {
      throw new ConflictException('Rejected claims cannot authorize a refund');
    }
    return null;
  }
  if (outcome === DISPUTE_DECISION_OUTCOME.REQUIRE_RETURN) {
    if (responsibility !== DISPUTE_RESPONSIBILITY.SELLER) {
      throw new ConflictException(
        'Seller fault is required for a return remedy',
      );
    }
    if (kind === DISPUTE_KIND.MISSING_ITEM) {
      throw new ConflictException('Missing item cannot require return');
    }
    const amount = requestedAmount ?? itemPrice;
    if (amount !== itemPrice) {
      throw new ConflictException(
        'Return remedy refund amount must equal item price',
      );
    }
    return amount;
  }
  const amount = requestedAmount ?? itemPrice;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > itemPrice) {
    throw new ConflictException(
      'Refund amount must be positive and within snapshotted item price',
    );
  }
  return amount;
}

@Injectable()
export class DisputeAdjudicationService {
  private readonly logger = new Logger(DisputeAdjudicationService.name);

  constructor(
    private readonly db: DataSource,
    private readonly disputeRefundService: DisputeRefundService,
    private readonly disputeReturnService: DisputeReturnService,
    private readonly outboxService: OutboxService,
  ) {}

  private async lockOrderAndIssue(manager: EntityManager, issueId: string) {
    const row = await manager
      .createQueryBuilder(DisputeCase, 'c')
      .innerJoin(DisputeIssue, 'i', 'i.caseId = c.id AND i.id = :issueId', {
        issueId,
      })
      .getOneOrFail();
    const order = await manager.findOneOrFail(Order, {
      where: { id: row.orderId },
      lock: { mode: 'pessimistic_write' },
    });
    const issue = await manager.findOneOrFail(DisputeIssue, {
      where: { id: issueId },
      lock: { mode: 'pessimistic_write' },
    });
    return { row, order, issue };
  }

  private async lockOrderIssueAndDecision(
    manager: EntityManager,
    decisionId: string,
  ) {
    const meta = await manager
      .createQueryBuilder(DisputeCase, 'c')
      .innerJoin(DisputeIssue, 'i', 'i.caseId = c.id')
      .innerJoin(
        DisputeDecision,
        'd',
        'd.issueId = i.id AND d.id = :decisionId',
        { decisionId },
      )
      .select('c.id', 'caseId')
      .addSelect('c.orderId', 'orderId')
      .addSelect('c.buyerId', 'buyerId')
      .addSelect('c.shopId', 'shopId')
      .addSelect('i.id', 'issueId')
      .getRawOne<{
        caseId: string;
        orderId: string;
        buyerId: string;
        shopId: string;
        issueId: string;
      }>();
    if (!meta) {
      await manager.findOneByOrFail(DisputeDecision, { id: decisionId });
      throw new ConflictException('Dispute case missing for decision');
    }
    const order = await manager.findOneOrFail(Order, {
      where: { id: meta.orderId },
      lock: { mode: 'pessimistic_write' },
    });
    const issue = await manager.findOneOrFail(DisputeIssue, {
      where: { id: meta.issueId },
      lock: { mode: 'pessimistic_write' },
    });
    const decision = await manager.findOneOrFail(DisputeDecision, {
      where: { id: decisionId },
      lock: { mode: 'pessimistic_write' },
    });
    const row = manager.create(DisputeCase, {
      id: meta.caseId,
      orderId: meta.orderId,
      buyerId: meta.buyerId,
      shopId: meta.shopId,
    });
    return { row, order, issue, decision };
  }

  async extend(_adminId: string, issueId: string, input: { reason: string }) {
    const data = disputeExtensionSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      const { issue } = await this.lockOrderAndIssue(manager, issueId);
      if (issue.extendedAt) {
        if (issue.extensionReason !== data.reason) {
          throw new ConflictException('Review was already extended');
        }
        return issue;
      }
      if (issue.status !== DISPUTE_ISSUE_STATE.ACTIVE) {
        throw new ConflictException('Only an active issue can be extended');
      }
      if (now >= issue.maxReviewDueAt) {
        throw new ConflictException('Maximum review window expired');
      }
      issue.extendedAt = now;
      issue.extensionReason = data.reason;
      issue.reviewDueAt = issue.maxReviewDueAt;
      return manager.save(issue);
    });
  }

  async decide(adminId: string, issueId: string, input: DisputeDecisionInput) {
    const data = disputeDecisionInputSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      const { row, order, issue } = await this.lockOrderAndIssue(
        manager,
        issueId,
      );
      if (await manager.existsBy(DisputeDecision, { issueId })) {
        throw new ConflictException(
          'Initial decision already recorded; use the appeal workflow',
        );
      }
      if (issue.status !== DISPUTE_ISSUE_STATE.ACTIVE) {
        throw new ConflictException('Only active issues can be decided');
      }
      if (
        row.state !== DISPUTE_CASE_STATE.OPEN ||
        order.status !== ORDER_STATUS.DISPUTE
      ) {
        throw new ConflictException('Case/order hold requires review');
      }
      if (await manager.existsBy(ShopSettlement, { orderId: order.id })) {
        throw new ConflictException('Order funds already released');
      }

      const sellerReplied = await manager.existsBy(DisputeMessage, {
        issueId,
        party: DISPUTE_PARTY.SELLER,
      });
      if (!sellerReplied && now <= issue.sellerRespondBy) {
        throw new ConflictException('Seller response window is still open');
      }

      const item = order.items.find(
        (entry) => entry.productId === issue.productId,
      );
      if (!item) throw new ConflictException('Disputed item missing on order');

      const refundAmount = resolveDecisionRefundAmount(
        issue.kind,
        data.outcome,
        data.responsibility,
        item.price,
        data.refundAmount,
      );

      const decision = await manager.save(
        DisputeDecision,
        manager.create(DisputeDecision, {
          issueId: issue.id,
          actorId: adminId,
          outcome: data.outcome,
          responsibility: data.responsibility,
          reason: data.reason,
          itemPrice: item.price,
          refundAmount,
          decidedAt: now,
          appealUntil: businessDeadline(
            now,
            DISPUTE_POLICY.APPEAL_BUSINESS_DAYS,
          ),
          finalizedAt: null,
          finalOutcome: null,
          finalRefundAmount: null,
          finalReason: null,
          finalActorId: null,
        }),
      );
      issue.status = DISPUTE_ISSUE_STATE.AWAITING_APPEAL;
      await manager.save(issue);
      await this.outboxService.record(manager, {
        eventType: EVENT_TYPES.DISPUTE_UPDATED,
        resourceId: row.id,
        payload: {
          disputeCaseId: row.id,
          orderId: row.orderId,
          buyerId: row.buyerId,
          shopId: row.shopId,
          event: `decided:${decision.id}`,
          includeAdmins: false,
          sendEmail: true,
        },
      });
      return decision;
    });
  }

  async submitAppeal(
    userId: string,
    decisionId: string,
    input: DisputeAppealInput,
  ) {
    const data = disputeAppealInputSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      const { row, order, issue, decision } =
        await this.lockOrderIssueAndDecision(manager, decisionId);
      const { party } = await assertDisputeParty(
        manager,
        userId,
        row.orderId,
        order,
      );

      if (decision.finalizedAt) {
        throw new ConflictException(
          'Issue has a final conclusion; no further appeal',
        );
      }
      if (now > decision.appealUntil) {
        throw new ConflictException('Appeal window closed');
      }
      if (await manager.existsBy(DisputeAppeal, { decisionId, party })) {
        throw new ConflictException(
          'Party appeal already filed for this decision',
        );
      }
      if (data.evidenceIds.length) {
        const files = await manager.find(DisputeEvidence, {
          where: {
            id: In(data.evidenceIds),
            orderId: row.orderId,
            uploadedById: userId,
          },
        });
        if (files.length !== data.evidenceIds.length) {
          throw new ConflictException(
            'Appeal evidence must belong to this uploader and order',
          );
        }
      }

      const appeal = await manager.save(
        DisputeAppeal,
        manager.create(DisputeAppeal, {
          decisionId: decision.id,
          actorId: userId,
          party,
          reason: data.reason,
          evidenceIds: [...data.evidenceIds].sort(),
          filedAt: now,
          reviewDueAt: businessDeadline(
            now,
            DISPUTE_POLICY.APPEAL_REVIEW_BUSINESS_DAYS,
          ),
          reviewOverdue: false,
        }),
      );
      issue.status = DISPUTE_ISSUE_STATE.APPEAL_REVIEW;
      await manager.save(issue);
      await this.outboxService.record(manager, {
        eventType: EVENT_TYPES.DISPUTE_UPDATED,
        resourceId: row.id,
        payload: {
          disputeCaseId: row.id,
          orderId: row.orderId,
          buyerId: row.buyerId,
          shopId: row.shopId,
          event: `appeal:${appeal.id}`,
          includeAdmins: true,
          sendEmail: false,
        },
      });
      return appeal;
    });
  }

  async concludeAppeal(
    adminId: string,
    decisionId: string,
    input: DisputeDecisionInput,
  ) {
    const data = disputeDecisionInputSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      const { row, issue, decision } = await this.lockOrderIssueAndDecision(
        manager,
        decisionId,
      );
      if (decision.finalizedAt) {
        throw new ConflictException('Issue already has a final conclusion');
      }
      const hasAppeals = await manager.existsBy(DisputeAppeal, { decisionId });
      if (!hasAppeals) {
        throw new ConflictException('No appeal submitted for this decision');
      }
      if (adminId === decision.actorId) {
        const anotherAdmin = await manager.existsBy(User, {
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          id: Not(adminId),
        });
        if (anotherAdmin) {
          throw new ConflictException(
            'Use another active Admin for appeal review',
          );
        }
      }
      const refundAmount = resolveDecisionRefundAmount(
        issue.kind,
        data.outcome,
        data.responsibility,
        decision.itemPrice,
        data.refundAmount,
      );

      decision.responsibility = data.responsibility;
      decision.finalizedAt = now;
      decision.finalOutcome = data.outcome;
      decision.finalRefundAmount = refundAmount;
      decision.finalReason = data.reason;
      decision.finalActorId = adminId;
      await manager.save(decision);
      await this.outboxService.record(manager, {
        eventType: EVENT_TYPES.DISPUTE_UPDATED,
        resourceId: row.id,
        payload: {
          disputeCaseId: row.id,
          orderId: row.orderId,
          buyerId: row.buyerId,
          shopId: row.shopId,
          event: `concluded:${decision.id}`,
          includeAdmins: false,
          sendEmail: true,
        },
      });

      await this.applyFinalOutcome(manager, decision, issue, row, now);
      return decision;
    });
  }

  async refreshIssue(issueId: string) {
    return this.db.transaction(async (manager) => {
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      const { row, issue } = await this.lockOrderAndIssue(manager, issueId);

      if (
        issue.status === DISPUTE_ISSUE_STATE.ACTIVE &&
        now > issue.reviewDueAt &&
        !issue.reviewOverdue
      ) {
        issue.reviewOverdue = true;
        await manager.save(issue);
      }

      if (
        issue.status === DISPUTE_ISSUE_STATE.AWAITING_APPEAL ||
        issue.status === DISPUTE_ISSUE_STATE.APPEAL_REVIEW
      ) {
        const decision = await manager.findOneOrFail(DisputeDecision, {
          where: { issueId: issue.id },
          lock: { mode: 'pessimistic_write' },
        });
        const appeals = await manager.find(DisputeAppeal, {
          where: { decisionId: decision.id },
        });
        if (!decision.finalizedAt) {
          for (const appeal of appeals) {
            if (now > appeal.reviewDueAt && !appeal.reviewOverdue) {
              appeal.reviewOverdue = true;
              await manager.save(appeal);
            }
          }
        }
        if (
          !decision.finalizedAt &&
          appeals.length === 0 &&
          now > decision.appealUntil
        ) {
          decision.finalizedAt = now;
          decision.finalOutcome = decision.outcome;
          decision.finalRefundAmount = decision.refundAmount;
          decision.finalReason = decision.reason;
          decision.finalActorId = null;
          await manager.save(decision);
          await this.applyFinalOutcome(manager, decision, issue, row, now);
        }
      }
      return issue;
    });
  }

  private async applyFinalOutcome(
    manager: EntityManager,
    decision: DisputeDecision,
    issue: DisputeIssue,
    row: DisputeCase,
    now: Date,
  ) {
    if (decision.finalOutcome === DISPUTE_DECISION_OUTCOME.REJECT_CLAIM) {
      issue.status = DISPUTE_ISSUE_STATE.RESOLVED_NO_REFUND;
      await manager.save(issue);
      await restoreDisputeCaseIfClear(manager, issue.caseId);
      return;
    }
    issue.status = DISPUTE_ISSUE_STATE.AWAITING_EXECUTION;
    await manager.save(issue);
    if (decision.finalOutcome === DISPUTE_DECISION_OUTCOME.REQUIRE_RETURN) {
      await this.disputeReturnService.ensureReturn(
        manager,
        decision,
        issue,
        row,
      );
      return;
    }
    await this.disputeRefundService.executeInTransaction(
      manager,
      decision.id,
      now,
    );
  }

  async run() {
    await this.db.manager
      .createQueryBuilder()
      .update(DisputeIssue)
      .set({ reviewOverdue: true })
      .where('status = :status', { status: DISPUTE_ISSUE_STATE.ACTIVE })
      .andWhere('"reviewOverdue" = false')
      .andWhere('"reviewDueAt" < clock_timestamp()')
      .execute();

    await this.db.manager
      .createQueryBuilder()
      .update(DisputeAppeal)
      .set({ reviewOverdue: true })
      .where('"reviewOverdue" = false')
      .andWhere('"reviewDueAt" < clock_timestamp()')
      .andWhere(
        'EXISTS (SELECT 1 FROM dispute_decisions d WHERE d.id = "decisionId" AND d."finalizedAt" IS NULL)',
      )
      .execute();

    const rows = await this.db.manager
      .createQueryBuilder(DisputeDecision, 'decision')
      .innerJoin(DisputeIssue, 'issue', 'issue.id = decision.issueId')
      .where('decision.finalizedAt IS NULL')
      .andWhere('issue.status = :status', {
        status: DISPUTE_ISSUE_STATE.AWAITING_APPEAL,
      })
      .andWhere('decision.appealUntil < clock_timestamp()')
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM dispute_appeals a WHERE a."decisionId" = decision.id)',
      )
      .select('issue.id', 'id')
      .orderBy('decision.appealUntil', 'ASC')
      .limit(DISPUTE_POLICY.BATCH_SIZE)
      .getRawMany<{ id: string }>();

    for (const row of rows) {
      try {
        await this.refreshIssue(row.id);
      } catch (error) {
        this.logger.error({
          issueId: row.id,
          message:
            error instanceof Error ? error.message : 'Dispute SLA scan failed',
        });
      }
    }

    await this.disputeReturnService.expireDue();
  }
}
