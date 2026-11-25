import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager } from 'typeorm';

import { ORDER_STATUS } from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities';
import { fulfillmentDeadline } from '@/modules/shipment/utils/fulfillment-calendar';
import { ShopSettlement } from '@/modules/shop-finance/entities/shop-settlement.entity';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import {
  DISPUTE_ACTION,
  DISPUTE_CASE_STATE,
  DISPUTE_DECISION_OUTCOME,
  DISPUTE_ISSUE_STATE,
  DISPUTE_KIND,
  DISPUTE_POLICY,
  DISPUTE_RESPONSIBILITY,
} from './constants/dispute.constant';
import {
  decisionFingerprint,
  loadDecisionReview,
} from './dispute-decision-review';
import {
  notifyDispute,
  populateDisputeDeadlines,
  recordDisputeAction,
} from './dispute.lifecycle';
import { DisputeDecision } from './entities/dispute-decision.entity';
import { assertDisputeRefundPlan } from './policies/dispute-refund-plan.policy';
import { disputeDecisionInputSchema } from './schemas/dispute-decision.schema';
import type { DisputeDecisionInput } from './schemas/dispute-decision.schema';

@Injectable()
export class DisputeAdjudicationService {
  constructor(private readonly db: DataSource) {}

  async review(issueId: string, offset = 0) {
    const manager = this.db.manager;
    const review = await loadDecisionReview(manager, issueId);
    const decision = await manager.findOneBy(DisputeDecision, { issueId });
    return {
      issue: review.issue,
      order: review.orderSnapshot,
      reviewToken: review.reviewToken,
      evidence: review.evidence,
      messages: review.messages.slice(
        offset,
        offset + DISPUTE_POLICY.BATCH_SIZE,
      ),
      messageCount: review.messages.length,
      messageOffset: offset,
      decision,
    };
  }

  async decide(adminId: string, issueId: string, input: DisputeDecisionInput) {
    const data = disputeDecisionInputSchema.parse(input);
    const fingerprint = decisionFingerprint({ issueId, adminId, ...data });
    return this.db.transaction(async (manager) => {
      await manager.findOneByOrFail(User, {
        id: adminId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      });
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      const replay = await manager.findOneBy(DisputeDecision, {
        requestId: data.requestId,
      });
      if (replay) {
        if (replay.requestFingerprint !== fingerprint)
          throw new ConflictException(
            'Decision request was already used with different input',
          );
        return replay;
      }
      if (await manager.existsBy(DisputeDecision, { issueId }))
        throw new ConflictException(
          'Initial decision already recorded; use the appeal workflow',
        );
      const review = await loadDecisionReview(manager, issueId);
      await this.assertDecidable(manager, review, data, now);
      const appealUntil = await fulfillmentDeadline(
        manager,
        now,
        DISPUTE_POLICY.APPEAL_BUSINESS_DAYS,
      );
      const decision = await this.saveDecision(
        manager,
        adminId,
        data,
        fingerprint,
        review,
        now,
        appealUntil,
      );
      review.issue.status = DISPUTE_ISSUE_STATE.AWAITING_APPEAL;
      await manager.save(review.issue);
      review.order.status = ORDER_STATUS.DISPUTE;
      await manager.save(Order, review.order);
      await recordDisputeAction(
        manager,
        issueId,
        DISPUTE_ACTION.DECIDED,
        adminId,
        now,
        data.reason,
      );
      await notifyDispute(
        manager,
        issueId,
        DISPUTE_ACTION.DECIDED,
        now,
        data.reason,
      );
      return decision;
    });
  }

  private async assertDecidable(
    manager: EntityManager,
    review: Awaited<ReturnType<typeof loadDecisionReview>>,
    data: DisputeDecisionInput,
    now: Date,
  ) {
    if (review.issue.status !== DISPUTE_ISSUE_STATE.ACTIVE)
      throw new ConflictException('Only active issues can be decided');
    const caseIsHeld =
      review.row.state === DISPUTE_CASE_STATE.OPEN &&
      review.order.status === ORDER_STATUS.DISPUTE;
    if (!caseIsHeld)
      throw new ConflictException('Case/order hold requires review');
    if (review.reviewToken !== data.reviewToken)
      throw new ConflictException(
        'Review changed; reload evidence and replies before deciding',
      );
    const returnWithoutSellerFault =
      data.outcome === DISPUTE_DECISION_OUTCOME.REQUIRE_RETURN &&
      data.responsibility !== DISPUTE_RESPONSIBILITY.SELLER;
    if (returnWithoutSellerFault)
      throw new ConflictException(
        'Seller fault is required for this return remedy',
      );
    const returningMissingItem =
      data.outcome === DISPUTE_DECISION_OUTCOME.REQUIRE_RETURN &&
      review.issue.kind === DISPUTE_KIND.MISSING_ITEM;
    if (returningMissingItem)
      throw new ConflictException(
        'Missing item cannot require return; record the finding without inventing a return remedy',
      );
    assertDisputeRefundPlan(
      review.issue.kind,
      data.outcome,
      review.orderSnapshot.itemPrice,
      data.refundPlan,
    );
    await populateDisputeDeadlines(manager, review.issue);
    const sellerWindowOpen =
      !review.issue.sellerRespondBy || now <= review.issue.sellerRespondBy;
    if (sellerWindowOpen)
      throw new ConflictException(
        'Seller response window is open or calendar unavailable',
      );
    const fundsReleased = await manager.existsBy(ShopSettlement, {
      orderId: review.order.id,
    });
    if (fundsReleased)
      throw new ConflictException(
        'Released funds require financial incident review',
      );
  }

  private saveDecision(
    manager: EntityManager,
    adminId: string,
    data: DisputeDecisionInput,
    fingerprint: string,
    review: Awaited<ReturnType<typeof loadDecisionReview>>,
    now: Date,
    appealUntil: Date | null,
  ) {
    return manager.save(
      DisputeDecision,
      manager.create(DisputeDecision, {
        issueId: review.issue.id,
        actorId: adminId,
        requestId: data.requestId,
        requestFingerprint: fingerprint,
        reviewToken: data.reviewToken,
        outcome: data.outcome,
        responsibility: data.responsibility,
        reason: data.reason,
        evidenceAssessment: data.evidenceAssessment,
        itemPrice: review.orderSnapshot.itemPrice,
        refundPlan: data.refundPlan ?? null,
        remedyKey: `${review.order.id}:${review.issue.productId}`,
        decidedAt: now,
        notifiedAt: now,
        appealUntil,
        calendarMissing: !appealUntil,
        reviewLate: review.issue.reviewDueAt
          ? now > review.issue.reviewDueAt
          : null,
        basis: {
          ...review.orderSnapshot,
          evidenceIds: review.evidence.map((file) => file.id),
          messageIds: review.messages.map((message) => message.id),
          sellerRespondBy: review.issue.sellerRespondBy!.toISOString(),
          reviewDueAt: review.issue.reviewDueAt?.toISOString() ?? null,
        },
      }),
    );
  }
}
