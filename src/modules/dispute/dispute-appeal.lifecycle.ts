import { EntityManager } from 'typeorm';

import { businessDeadline } from '@/modules/shipment/utils/business-calendar';

import {
  DISPUTE_ACTION,
  DISPUTE_APPEAL_ELIGIBILITY,
  DISPUTE_FINAL_SOURCE,
  DISPUTE_ISSUE_STATE,
  DISPUTE_POLICY,
} from './constants/dispute.constant';
import {
  appealWindowEnded,
  classifyAppealEligibility,
} from './dispute-appeal.policy';
import { populateDecisionAppealDeadline } from './dispute-decision.lifecycle';
import { saveFinalDisputeDecision } from './dispute-finalization.lifecycle';
import { notifyDispute, recordDisputeAction } from './dispute.lifecycle';
import { DisputeAppealReview } from './entities/dispute-appeal-review.entity';
import { DisputeAppeal } from './entities/dispute-appeal.entity';
import { DisputeDecision } from './entities/dispute-decision.entity';
import { DisputeFinalDecision } from './entities/dispute-final-decision.entity';
import { DisputeIssue } from './entities/dispute-issue.entity';

async function updateReviewClock(
  manager: EntityManager,
  review: DisputeAppealReview,
  issueId: string,
  appealUntil: Date | null,
  now: Date,
) {
  review.reviewStartAt ??= appealUntil;
  if (review.reviewStartAt && !review.reviewDueAt)
    review.reviewDueAt = businessDeadline(
      review.reviewStartAt,
      DISPUTE_POLICY.APPEAL_REVIEW_BUSINESS_DAYS,
    );
  if (review.reviewDueAt && !review.escalationDueAt)
    review.escalationDueAt = businessDeadline(
      review.reviewDueAt,
      DISPUTE_POLICY.ESCALATION_BUSINESS_DAYS,
    );
  review.calendarMissing =
    !review.reviewStartAt || !review.reviewDueAt || !review.escalationDueAt;
  const reviewLate = review.reviewDueAt && now > review.reviewDueAt;
  if (reviewLate && !review.reviewOverdue) {
    review.reviewOverdue = true;
    await recordDisputeAction(
      manager,
      issueId,
      DISPUTE_ACTION.APPEAL_OVERDUE,
      null,
      now,
    );
    await notifyDispute(
      manager,
      issueId,
      DISPUTE_ACTION.APPEAL_OVERDUE,
      now,
      'Appeal review SLA exceeded; funds remain held',
    );
  }
  if (reviewLate && !review.escalatedAt) {
    review.escalatedAt = now;
    await recordDisputeAction(
      manager,
      issueId,
      DISPUTE_ACTION.APPEAL_ESCALATED,
      null,
      now,
    );
    await notifyDispute(
      manager,
      issueId,
      DISPUTE_ACTION.APPEAL_ESCALATED,
      now,
      'Appeal review escalated; no automatic merits decision',
    );
  }
  await manager.save(review);
}

/** Caller owns the commerce lock, transaction, and authoritative database clock. */
export async function reconcileAppeals(
  manager: EntityManager,
  decisionId: string,
  now: Date,
) {
  let decision = await manager.findOneByOrFail(DisputeDecision, {
    id: decisionId,
  });
  const issue = await manager.findOneByOrFail(DisputeIssue, {
    id: decision.issueId,
  });
  const appeals = await manager.find(DisputeAppeal, {
    where: { decisionId },
    order: { filedAt: 'ASC', id: 'ASC' },
  });
  let review = await manager.findOneBy(DisputeAppealReview, { decisionId });
  let finalDecision = await manager.findOneBy(DisputeFinalDecision, {
    decisionId,
  });
  if (finalDecision) return { decision, issue, appeals, review, finalDecision };
  decision = await populateDecisionAppealDeadline(manager, issue.id);
  if (decision.appealUntil) {
    for (const appeal of appeals) {
      if (appeal.eligibility !== DISPUTE_APPEAL_ELIGIBILITY.PENDING_CALENDAR)
        continue;
      appeal.eligibility = classifyAppealEligibility(
        appeal.filedAt,
        decision.appealUntil,
      );
      await manager.update(DisputeAppeal, appeal.id, {
        eligibility: appeal.eligibility,
      });
    }
  }
  const requiresReview = appeals.some(
    (appeal) => appeal.eligibility !== DISPUTE_APPEAL_ELIGIBILITY.OUT_OF_TIME,
  );
  if (requiresReview) {
    review ??= manager.create(DisputeAppealReview, {
      decisionId,
      reviewStartAt: null,
      reviewDueAt: null,
      calendarMissing: true,
      reviewOverdue: false,
      escalatedAt: null,
      escalationDueAt: null,
    });
    issue.status = DISPUTE_ISSUE_STATE.APPEAL_REVIEW;
    await manager.save(issue);
    await updateReviewClock(
      manager,
      review,
      issue.id,
      decision.appealUntil,
      now,
    );
  } else if (appealWindowEnded(now, decision.appealUntil)) {
    finalDecision = await saveFinalDisputeDecision(
      manager,
      decision,
      issue,
      {
        source: DISPUTE_FINAL_SOURCE.ORIGINAL_UNAPPEALED,
        actorId: null,
        outcome: decision.outcome,
        refundPlan: decision.refundPlan ?? null,
        responsibility: decision.responsibility,
        reason: decision.reason,
        evidenceAssessment: decision.evidenceAssessment,
        sameAdminReason: null,
        appealIds: [],
        requestId: null,
        requestFingerprint: null,
        reviewToken: null,
        reviewLate: null,
      },
      now,
    );
  }
  return { decision, issue, appeals, review, finalDecision };
}
