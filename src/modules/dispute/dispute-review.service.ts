import { ConflictException, Injectable, Logger } from '@nestjs/common';

import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThan,
} from 'typeorm';

import { businessDeadline } from '@/modules/shipment/utils/business-calendar';

import {
  DISPUTE_ACTION,
  DISPUTE_ISSUE_STATE,
  DISPUTE_PARTY,
  DISPUTE_POLICY,
} from './constants/dispute.constant';
import { reconcileAppeals } from './dispute-appeal.lifecycle';
import { restoreDisputeCaseIfClear } from './dispute-finalization.lifecycle';
import {
  notifyDispute,
  populateDisputeDeadlines,
  recordDisputeAction,
} from './dispute.lifecycle';
import { DisputeDecision } from './entities/dispute-decision.entity';
import { DisputeIssue } from './entities/dispute-issue.entity';
import { DisputeMessage } from './entities/dispute-message.entity';
import { disputeExtensionSchema } from './schemas/dispute.schema';

const clockIssueStates = [
  DISPUTE_ISSUE_STATE.NEEDS_EVIDENCE,
  DISPUTE_ISSUE_STATE.ACTIVE,
  DISPUTE_ISSUE_STATE.AWAITING_APPEAL,
  DISPUTE_ISSUE_STATE.APPEAL_REVIEW,
];

@Injectable()
export class DisputeReviewService {
  private readonly logger = new Logger(DisputeReviewService.name);
  private cursor: string | undefined;
  constructor(private readonly db: DataSource) {}

  private async lock(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }

  async refreshIssue(issueId: string) {
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const issue = await manager.findOneByOrFail(DisputeIssue, {
        id: issueId,
      });
      const supplementExpired =
        issue.status === DISPUTE_ISSUE_STATE.NEEDS_EVIDENCE &&
        now >= issue.supplementBy;
      if (supplementExpired) await this.closeIncomplete(manager, issue, now);
      if (issue.status === DISPUTE_ISSUE_STATE.ACTIVE)
        await this.updateSla(manager, issue, now);
      const appealClock =
        issue.status === DISPUTE_ISSUE_STATE.AWAITING_APPEAL ||
        issue.status === DISPUTE_ISSUE_STATE.APPEAL_REVIEW;
      if (appealClock) {
        const decision = await manager.findOneByOrFail(DisputeDecision, {
          issueId: issue.id,
        });
        return (await reconcileAppeals(manager, decision.id, now)).issue;
      }
      return issue;
    });
  }

  private async closeIncomplete(
    manager: EntityManager,
    issue: DisputeIssue,
    now: Date,
  ) {
    issue.status = DISPUTE_ISSUE_STATE.CLOSED_INCOMPLETE;
    await manager.save(issue);
    await recordDisputeAction(
      manager,
      issue.id,
      DISPUTE_ACTION.CLOSED_INCOMPLETE,
      null,
      now,
      'Missing minimum evidence at original supplementation deadline',
    );
    await notifyDispute(
      manager,
      issue.id,
      DISPUTE_ACTION.CLOSED_INCOMPLETE,
      now,
      'Closed for incomplete evidence; no fault or refund decision',
    );
    await restoreDisputeCaseIfClear(manager, issue.caseId);
  }

  private async updateSla(
    manager: EntityManager,
    issue: DisputeIssue,
    now: Date,
  ) {
    await populateDisputeDeadlines(manager, issue);
    const reviewLate = issue.reviewDueAt && now > issue.reviewDueAt;
    if (reviewLate && !issue.reviewOverdue) {
      issue.reviewOverdue = true;
      await recordDisputeAction(
        manager,
        issue.id,
        DISPUTE_ACTION.OVERDUE,
        null,
        now,
      );
      await notifyDispute(
        manager,
        issue.id,
        DISPUTE_ACTION.OVERDUE,
        now,
        'Admin review SLA exceeded; funds remain held',
      );
    }
    const maxReviewExpired = issue.maxReviewDueAt && now > issue.maxReviewDueAt;
    if (maxReviewExpired && !issue.escalatedAt) {
      issue.escalatedAt = now;
      await recordDisputeAction(
        manager,
        issue.id,
        DISPUTE_ACTION.ESCALATED,
        null,
        now,
      );
      await notifyDispute(
        manager,
        issue.id,
        DISPUTE_ACTION.ESCALATED,
        now,
        'Maximum review SLA exceeded; escalated for decision, no automatic winner',
      );
    }
    if (issue.escalatedAt && issue.maxReviewDueAt)
      issue.escalationDueAt ??= businessDeadline(
        issue.maxReviewDueAt,
        DISPUTE_POLICY.ESCALATION_BUSINESS_DAYS,
      );
    await this.classifyReplies(manager, issue);
    const sellerLate = issue.sellerRespondBy && now > issue.sellerRespondBy;
    if (sellerLate) {
      const hasResponded = await manager.existsBy(DisputeMessage, {
        issueId: issue.id,
        party: DISPUTE_PARTY.SELLER,
        createdAt: LessThanOrEqual(issue.sellerRespondBy!),
      });
      issue.sellerResponseOverdue ||= !hasResponded;
    }
    issue.calendarMissing ||= Boolean(
      issue.escalatedAt && !issue.escalationDueAt,
    );
    await manager.save(issue);
  }

  private async classifyReplies(manager: EntityManager, issue: DisputeIssue) {
    if (!issue.sellerRespondBy) return;
    // Only the lateness projection is reconciled; original content/time remains immutable.
    await manager
      .createQueryBuilder()
      .update(DisputeMessage)
      .set({ late: () => '"createdAt" > :deadline' })
      .where({ issueId: issue.id, party: DISPUTE_PARTY.SELLER, late: IsNull() })
      .setParameter('deadline', issue.sellerRespondBy)
      .execute();
  }

  async extend(adminId: string, issueId: string, input: { reason: string }) {
    const data = disputeExtensionSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const issue = await manager.findOneByOrFail(DisputeIssue, {
        id: issueId,
      });
      if (issue.extendedAt) {
        if (issue.extensionReason !== data.reason)
          throw new ConflictException('Review was already extended');
        return issue;
      }
      if (issue.status !== DISPUTE_ISSUE_STATE.ACTIVE)
        throw new ConflictException('Only an active issue can be extended');
      await populateDisputeDeadlines(manager, issue);
      const maxExpired = issue.maxReviewDueAt && now >= issue.maxReviewDueAt;
      if (maxExpired)
        throw new ConflictException(
          'Maximum review window expired; escalation required',
        );
      issue.extendedAt = now;
      issue.extensionReason = data.reason;
      issue.reviewDueAt = issue.maxReviewDueAt;
      await manager.save(issue);
      await recordDisputeAction(
        manager,
        issueId,
        DISPUTE_ACTION.EXTENDED,
        adminId,
        now,
        data.reason,
      );
      await notifyDispute(
        manager,
        issueId,
        DISPUTE_ACTION.EXTENDED,
        now,
        data.reason,
      );
      return issue;
    });
  }

  async run() {
    const rows = await this.db.manager.find(DisputeIssue, {
      select: { id: true },
      where: {
        status: In(clockIssueStates),
        ...(this.cursor ? { id: MoreThan(this.cursor) } : {}),
      },
      order: { id: 'ASC' },
      take: DISPUTE_POLICY.BATCH_SIZE,
    });
    for (const row of rows) {
      this.cursor = row.id;
      try {
        await this.refreshIssue(row.id);
      } catch {
        this.logger.error({
          issueId: row.id,
          message: 'Dispute SLA transaction rolled back; retry on next scan',
        });
      }
    }
    if (rows.length < DISPUTE_POLICY.BATCH_SIZE) this.cursor = undefined;
  }
}
