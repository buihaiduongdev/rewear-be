import { ConflictException, Injectable } from '@nestjs/common';

import { EntityManager, In, IsNull } from 'typeorm';

import {
  ORDER_POLICY,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { Order } from '@/modules/order/entities/order.entity';
import { OrderAccess } from '@/modules/order/order.access';

import {
  DISPUTE_CASE_STATE,
  DISPUTE_ISSUE_STATE,
  DISPUTE_PARTY,
} from './constants/dispute.constant';
import { DisputeDecision } from './entities/dispute-decision.entity';
import { DisputeCase, DisputeIssue } from './entities/dispute.entity';
import { DisputeReturn } from './returns/entities/dispute-return.entity';
import { DisputeSafetyWaiver } from './returns/entities/return-exception.entity';

@Injectable()
export class DisputeAccess {
  constructor(private readonly access: OrderAccess) {}

  async assertParty(manager: EntityManager, userId: string, orderId: string) {
    const order = await manager.findOneByOrFail(Order, { id: orderId });
    if (order.buyerId === userId) return { order, party: DISPUTE_PARTY.BUYER };
    await this.access.assertManage(manager, userId, order.shopId);
    return { order, party: DISPUTE_PARTY.SELLER };
  }

  async windowOpen(manager: EntityManager, order: Order, now: Date) {
    const verification = await manager.findOneBy(OrderDeliveryVerification, {
      orderId: order.id,
    });
    if (!verification) return false;
    const matchesDelivery =
      order.deliveryVerifiedAt?.getTime() ===
      verification.deliveredAt.getTime();
    const matchesDeadline =
      order.disputeDeadlineAt?.getTime() ===
      verification.disputeDeadlineAt.getTime();
    const hasFullWindow =
      verification.disputeDeadlineAt.getTime() ===
      verification.deliveredAt.getTime() + ORDER_POLICY.DISPUTE_WINDOW_MS;
    const withinWindow =
      verification.deliveredAt <= now && now < verification.disputeDeadlineAt;
    const deliveredState = (
      [
        ORDER_STATUS.DELIVERED,
        ORDER_STATUS.COMPLETED,
        ORDER_STATUS.DISPUTE,
      ] as readonly string[]
    ).includes(order.status);
    return (
      matchesDelivery &&
      matchesDeadline &&
      hasFullWindow &&
      withinWindow &&
      deliveredState
    );
  }

  async assertUploadAllowed(
    manager: EntityManager,
    userId: string,
    orderId: string,
    now: Date,
  ) {
    const party = await this.assertParty(manager, userId, orderId);
    const row = await manager.findOneBy(DisputeCase, {
      orderId,
      state: DISPUTE_CASE_STATE.OPEN,
    });
    const issues = row
      ? await manager.find(DisputeIssue, {
          where: {
            caseId: row.id,
            status: In([
              DISPUTE_ISSUE_STATE.ACTIVE,
              DISPUTE_ISSUE_STATE.NEEDS_EVIDENCE,
              DISPUTE_ISSUE_STATE.AWAITING_APPEAL,
              DISPUTE_ISSUE_STATE.APPEAL_REVIEW,
            ]),
          },
        })
      : [];
    const hasActiveIssue = issues.some(
      (issue) => issue.status === DISPUTE_ISSUE_STATE.ACTIVE,
    );
    const hasSupplementWindow = issues.some(
      (issue) =>
        issue.status === DISPUTE_ISSUE_STATE.NEEDS_EVIDENCE &&
        now < issue.supplementBy,
    );
    const pendingDecisionIds = issues
      .filter(
        (issue) =>
          issue.status === DISPUTE_ISSUE_STATE.AWAITING_APPEAL ||
          issue.status === DISPUTE_ISSUE_STATE.APPEAL_REVIEW,
      )
      .map((issue) => issue.id);
    const decisions = pendingDecisionIds.length
      ? await manager.find(DisputeDecision, {
          where: { issueId: In(pendingDecisionIds) },
        })
      : [];
    const canPrepareAppeal = decisions.some(
      (decision) => !decision.appealUntil || now <= decision.appealUntil,
    );
    const buyerCanUpload =
      party.party === DISPUTE_PARTY.BUYER &&
      (hasActiveIssue ||
        canPrepareAppeal ||
        hasSupplementWindow ||
        (await this.windowOpen(manager, party.order, now)));
    const sellerCanUpload =
      party.party === DISPUTE_PARTY.SELLER &&
      (hasActiveIssue || canPrepareAppeal);
    const returnWindow = await manager.existsBy(DisputeReturn, {
      orderId,
      state: In([
        'WAITING_LABEL',
        'AWAITING_HANDOVER',
        'PAUSED',
        'IN_TRANSIT',
        'INSPECTION',
        'OBJECTION',
      ]),
    });
    const safetyWindow = await manager.existsBy(DisputeSafetyWaiver, {
      orderId,
      fulfilledAt: IsNull(),
    });
    const canUpload =
      buyerCanUpload || sellerCanUpload || returnWindow || safetyWindow;
    if (!canUpload)
      throw new ConflictException('No open dispute evidence window');
    return party;
  }
}
