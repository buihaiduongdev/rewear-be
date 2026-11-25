import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager, In, Not } from 'typeorm';

import { ORDER_STATUS } from '@/modules/order/constants/order.constant';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import {
  DISPUTE_ACTION,
  DISPUTE_APPEAL_ELIGIBILITY,
  DISPUTE_CASE_STATE,
  DISPUTE_FINAL_SOURCE,
  DISPUTE_ISSUE_STATE,
  DISPUTE_PARTY,
} from './constants/dispute.constant';
import { loadAppealReview } from './dispute-appeal-review';
import { reconcileAppeals } from './dispute-appeal.lifecycle';
import { decisionFingerprint } from './dispute-decision-review';
import { populateDecisionAppealDeadline } from './dispute-decision.lifecycle';
import { saveFinalDisputeDecision } from './dispute-finalization.lifecycle';
import { DisputeAccess } from './dispute.access';
import { notifyDispute, recordDisputeAction } from './dispute.lifecycle';
import { DisputeAppealEvidence } from './entities/dispute-appeal-evidence.entity';
import { DisputeAppeal } from './entities/dispute-appeal.entity';
import { DisputeCase } from './entities/dispute-case.entity';
import { DisputeDecision } from './entities/dispute-decision.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
import { DisputeFinalDecision } from './entities/dispute-final-decision.entity';
import { DisputeIssue } from './entities/dispute-issue.entity';
import { assertDisputeRefundPlan } from './policies/dispute-refund-plan.policy';
import { assertDisputeRemedy } from './policies/dispute-remedy.policy';
import {
  disputeAppealConclusionSchema,
  disputeAppealInputSchema,
} from './schemas/dispute-appeal.schema';
import type {
  DisputeAppealConclusionInput,
  DisputeAppealInput,
} from './schemas/dispute-appeal.schema';

@Injectable()
export class DisputeAppealService {
  constructor(
    private readonly db: DataSource,
    private readonly access: DisputeAccess,
  ) {}

  private async lock(manager: EntityManager) {
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }

  async submit(userId: string, decisionId: string, input: DisputeAppealInput) {
    const data = disputeAppealInputSchema.parse(input);
    const fingerprint = decisionFingerprint({
      decisionId,
      userId,
      ...data,
      evidenceIds: [...data.evidenceIds].sort(),
    });
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      let decision = await manager.findOneByOrFail(DisputeDecision, {
        id: decisionId,
      });
      const issue = await manager.findOneByOrFail(DisputeIssue, {
        id: decision.issueId,
      });
      const row = await manager.findOneByOrFail(DisputeCase, {
        id: issue.caseId,
      });
      const { party } = await this.access.assertParty(
        manager,
        userId,
        row.orderId,
      );
      const replay = await manager.findOneBy(DisputeAppeal, {
        requestId: data.requestId,
      });
      if (replay) {
        if (replay.requestFingerprint !== fingerprint)
          throw new ConflictException(
            'Appeal request already used with different input',
          );
        return replay;
      }
      if (await manager.existsBy(DisputeFinalDecision, { decisionId }))
        throw new ConflictException(
          'Issue has a final conclusion; no further appeal',
        );
      decision = await populateDecisionAppealDeadline(manager, issue.id);
      const windowClosed = decision.appealUntil && now > decision.appealUntil;
      if (windowClosed) throw new ConflictException('Appeal window closed');
      if (await manager.existsBy(DisputeAppeal, { decisionId, party }))
        throw new ConflictException(
          'Party appeal already filed for this decision',
        );
      const stateAllowsAppeal = [
        DISPUTE_ISSUE_STATE.AWAITING_APPEAL,
        DISPUTE_ISSUE_STATE.APPEAL_REVIEW,
      ].includes(issue.status as typeof DISPUTE_ISSUE_STATE.AWAITING_APPEAL);
      if (!stateAllowsAppeal || row.state !== DISPUTE_CASE_STATE.OPEN)
        throw new ConflictException('Issue is not awaiting appeal');
      await this.assertEvidence(manager, userId, row.orderId, decision, data);
      const appeal = await this.saveAppeal(
        manager,
        decision,
        userId,
        party,
        data,
        fingerprint,
        now,
      );
      issue.status = DISPUTE_ISSUE_STATE.APPEAL_REVIEW;
      await manager.save(issue);
      const action =
        party === DISPUTE_PARTY.BUYER
          ? DISPUTE_ACTION.APPEAL_BUYER_RECEIVED
          : DISPUTE_ACTION.APPEAL_SELLER_RECEIVED;
      await recordDisputeAction(
        manager,
        issue.id,
        action,
        userId,
        now,
        data.reason,
      );
      await notifyDispute(manager, issue.id, action, now, data.reason);
      await reconcileAppeals(manager, decisionId, now);
      return appeal;
    });
  }

  private async saveAppeal(
    manager: EntityManager,
    decision: DisputeDecision,
    userId: string,
    party: DisputeAppeal['party'],
    data: DisputeAppealInput,
    fingerprint: string,
    now: Date,
  ) {
    const appeal = await manager.save(
      DisputeAppeal,
      manager.create(DisputeAppeal, {
        decisionId: decision.id,
        actorId: userId,
        party,
        requestId: data.requestId,
        requestFingerprint: fingerprint,
        reason: data.reason,
        specificError: data.specificError,
        evidenceIds: [...data.evidenceIds].sort(),
        filedAt: now,
        eligibility: decision.appealUntil
          ? DISPUTE_APPEAL_ELIGIBILITY.ACCEPTED
          : DISPUTE_APPEAL_ELIGIBILITY.PENDING_CALENDAR,
      }),
    );
    for (const evidenceId of data.evidenceIds)
      await manager.save(
        DisputeAppealEvidence,
        manager.create(DisputeAppealEvidence, {
          appealId: appeal.id,
          evidenceId,
        }),
      );
    return appeal;
  }

  private async assertEvidence(
    manager: EntityManager,
    userId: string,
    orderId: string,
    decision: DisputeDecision,
    data: DisputeAppealInput,
  ) {
    const files = data.evidenceIds.length
      ? await manager.find(DisputeEvidence, {
          where: {
            id: In(data.evidenceIds),
            orderId,
            uploadedById: userId,
          },
        })
      : [];
    if (files.length !== data.evidenceIds.length)
      throw new ConflictException(
        'Appeal evidence must belong to this uploader and order',
      );
    const hasNewEvidence = files.some(
      (file) => !decision.basis.evidenceIds.includes(file.id),
    );
    if (!data.specificError && !hasNewEvidence)
      throw new ConflictException(
        'Appeal requires new evidence or a specific error',
      );
  }

  review(decisionId: string) {
    return loadAppealReview(this.db.manager, decisionId);
  }

  refresh(decisionId: string) {
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      await reconcileAppeals(manager, decisionId, now);
      return loadAppealReview(manager, decisionId);
    });
  }

  async conclude(
    adminId: string,
    decisionId: string,
    input: DisputeAppealConclusionInput,
  ) {
    const data = disputeAppealConclusionSchema.parse(input);
    const fingerprint = decisionFingerprint({ decisionId, adminId, ...data });
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      await manager.findOneByOrFail(User, {
        id: adminId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      });
      const replay = await manager.findOneBy(DisputeFinalDecision, {
        requestId: data.requestId,
      });
      if (replay) {
        if (replay.requestFingerprint !== fingerprint)
          throw new ConflictException('Final decision request already used');
        return replay;
      }
      const state = await reconcileAppeals(manager, decisionId, now);
      if (state.finalDecision)
        throw new ConflictException('Issue already has a final conclusion');
      const current = await loadAppealReview(manager, decisionId);
      if (current.reviewToken !== data.reviewToken)
        throw new ConflictException(
          'Appeal review changed; reload both requests',
        );
      const canConclude =
        state.decision.appealUntil && now > state.decision.appealUntil;
      if (!canConclude)
        throw new ConflictException(
          'Common appeal submission window is still open or unverified',
        );
      const accepted = state.appeals.filter(
        (appeal) => appeal.eligibility === DISPUTE_APPEAL_ELIGIBILITY.ACCEPTED,
      );
      if (!accepted.length)
        throw new ConflictException('No accepted appeals require Admin review');
      if (
        current.row.state !== DISPUTE_CASE_STATE.OPEN ||
        current.order.status !== ORDER_STATUS.DISPUTE
      )
        throw new ConflictException('Case/order hold requires review');
      await this.assertReviewer(
        manager,
        adminId,
        state.decision,
        data.sameAdminReason,
      );
      assertDisputeRemedy(state.issue.kind, data.outcome, data.responsibility);
      assertDisputeRefundPlan(
        state.issue.kind,
        data.outcome,
        state.decision.itemPrice,
        data.refundPlan,
      );
      return saveFinalDisputeDecision(
        manager,
        state.decision,
        state.issue,
        {
          source: DISPUTE_FINAL_SOURCE.APPEAL_REVIEW,
          actorId: adminId,
          requestId: data.requestId,
          requestFingerprint: fingerprint,
          reviewToken: data.reviewToken,
          outcome: data.outcome,
          refundPlan: data.refundPlan ?? null,
          responsibility: data.responsibility,
          reason: data.reason,
          evidenceAssessment: data.evidenceAssessment,
          sameAdminReason:
            adminId === state.decision.actorId ? data.sameAdminReason : null,
          appealIds: accepted.map((appeal) => appeal.id),
          reviewLate: state.review?.reviewDueAt
            ? now > state.review.reviewDueAt
            : null,
        },
        now,
      );
    });
  }

  private async assertReviewer(
    manager: EntityManager,
    adminId: string,
    decision: DisputeDecision,
    reason: string | null,
  ) {
    if (adminId !== decision.actorId) return;
    const anotherAdmin = await manager.existsBy(User, {
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      id: Not(adminId),
    });
    if (anotherAdmin)
      throw new ConflictException('Use another active Admin for appeal review');
    if (!reason)
      throw new ConflictException(
        'Original Admin fallback requires an explicit exception reason',
      );
  }
}
