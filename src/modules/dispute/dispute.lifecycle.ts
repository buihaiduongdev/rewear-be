import { EntityManager } from 'typeorm';

import { fulfillmentDeadline } from '@/modules/shipment/utils/fulfillment-calendar';

import {
  DISPUTE_ACTION,
  DISPUTE_EVIDENCE_STATE,
  DISPUTE_ISSUE_STATE,
  DISPUTE_NOTICE_AUDIENCE,
  DISPUTE_POLICY,
} from './constants/dispute.constant';
import {
  DisputeAttachment,
  DisputeAudit,
  DisputeEvidence,
  DisputeIssue,
  DisputeNotice,
} from './entities/dispute.entity';
import { hasMinimumDisputeEvidence } from './policies/dispute-evidence.policy';
import type { DisputeAction } from './types/dispute.type';

export async function recordDisputeAction(
  manager: EntityManager,
  issueId: string,
  action: DisputeAction,
  actorId: string | null,
  now: Date,
  reason: string | null = null,
) {
  await manager.save(
    DisputeAudit,
    manager.create(DisputeAudit, {
      issueId,
      action,
      actorId,
      reason,
      createdAt: now,
    }),
  );
}

export async function notifyDispute(
  manager: EntityManager,
  issueId: string,
  action: DisputeAction,
  now: Date,
  reason: string,
) {
  for (const audience of Object.values(DISPUTE_NOTICE_AUDIENCE)) {
    await manager.save(
      DisputeNotice,
      manager.create(DisputeNotice, {
        issueId,
        action,
        audience,
        reason,
        createdAt: now,
      }),
    );
  }
}

export async function populateDisputeDeadlines(
  manager: EntityManager,
  issue: DisputeIssue,
) {
  if (!issue.validAt) return;
  issue.maxReviewDueAt ??= await fulfillmentDeadline(
    manager,
    issue.validAt,
    DISPUTE_POLICY.MAX_REVIEW_BUSINESS_DAYS,
  );
  issue.reviewDueAt ??= await fulfillmentDeadline(
    manager,
    issue.validAt,
    issue.extendedAt
      ? DISPUTE_POLICY.MAX_REVIEW_BUSINESS_DAYS
      : DISPUTE_POLICY.REVIEW_BUSINESS_DAYS,
  );
  if (issue.extendedAt && issue.maxReviewDueAt)
    issue.reviewDueAt = issue.maxReviewDueAt;
  if (issue.sellerNotifiedAt)
    issue.sellerRespondBy ??= await fulfillmentDeadline(
      manager,
      issue.sellerNotifiedAt,
      DISPUTE_POLICY.SELLER_RESPONSE_BUSINESS_DAYS,
    );
  issue.calendarMissing =
    !issue.reviewDueAt || !issue.maxReviewDueAt || !issue.sellerRespondBy;
}

export async function activateDisputeIssue(
  manager: EntityManager,
  issue: DisputeIssue,
  buyerId: string,
  now: Date,
) {
  if (issue.status !== DISPUTE_ISSUE_STATE.NEEDS_EVIDENCE) return;
  const evidence = await manager
    .createQueryBuilder(DisputeEvidence, 'evidence')
    .innerJoin(
      DisputeAttachment,
      'attachment',
      'attachment.evidenceId = evidence.id',
    )
    .where('attachment.issueId = :issueId', { issueId: issue.id })
    .andWhere('evidence.uploadedById = :buyerId AND evidence.status = :ready', {
      buyerId,
      ready: DISPUTE_EVIDENCE_STATE.READY,
    })
    .getMany();
  const hasMinimum = hasMinimumDisputeEvidence(
    issue.kind,
    evidence.flatMap((row) => row.tags),
  );
  if (!hasMinimum) return;
  issue.status = DISPUTE_ISSUE_STATE.ACTIVE;
  issue.validAt = now;
  issue.sellerNotifiedAt = now;
  await populateDisputeDeadlines(manager, issue);
  await manager.save(issue);
  await recordDisputeAction(
    manager,
    issue.id,
    DISPUTE_ACTION.VALIDATED,
    buyerId,
    now,
  );
  await notifyDispute(
    manager,
    issue.id,
    DISPUTE_ACTION.VALIDATED,
    now,
    'Issue ready for review; seller response requested',
  );
}
