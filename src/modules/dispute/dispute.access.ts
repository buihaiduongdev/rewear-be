import { ConflictException, Injectable } from '@nestjs/common';

import { EntityManager, In } from 'typeorm';

import {
  ORDER_POLICY,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { OrderAccess } from '@/modules/order/order.access';

import {
  DISPUTE_CASE_STATE,
  DISPUTE_ISSUE_STATE,
  DISPUTE_PARTY,
  OPEN_DISPUTE_STATES,
} from './constants/dispute.constant';
import { DisputeCase } from './entities/dispute-case.entity';
import { DisputeDecision } from './entities/dispute-decision.entity';
import { DisputeIssue } from './entities/dispute-issue.entity';
import { RETURN_STATE } from './returns/constants/return.constant';
import { DisputeReturn } from './returns/entities/dispute-return.entity';

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
              DISPUTE_ISSUE_STATE.AWAITING_APPEAL,
              DISPUTE_ISSUE_STATE.APPEAL_REVIEW,
            ]),
          },
        })
      : [];
    const hasActiveIssue = issues.some(
      (issue) => issue.status === DISPUTE_ISSUE_STATE.ACTIVE,
    );
    const appealIssueIds = issues
      .filter(
        (issue) =>
          issue.status === DISPUTE_ISSUE_STATE.AWAITING_APPEAL ||
          issue.status === DISPUTE_ISSUE_STATE.APPEAL_REVIEW,
      )
      .map((issue) => issue.id);
    const decisions = appealIssueIds.length
      ? await manager.find(DisputeDecision, {
          where: { issueId: In(appealIssueIds) },
        })
      : [];
    const canPrepareAppeal = decisions.some(
      (decision) => !decision.finalizedAt && now <= decision.appealUntil,
    );
    const returnWindow = await manager.existsBy(DisputeReturn, {
      orderId,
      state: In([
        RETURN_STATE.WAITING_LABEL,
        RETURN_STATE.AWAITING_HANDOVER,
        RETURN_STATE.IN_TRANSIT,
      ]),
    });
    const buyerCanUpload =
      party.party === DISPUTE_PARTY.BUYER &&
      (hasActiveIssue ||
        canPrepareAppeal ||
        (await this.windowOpen(manager, party.order, now)));
    const sellerCanUpload =
      party.party === DISPUTE_PARTY.SELLER &&
      (hasActiveIssue || canPrepareAppeal);
    if (!buyerCanUpload && !sellerCanUpload && !returnWindow) {
      throw new ConflictException('No open dispute evidence window');
    }
    return party;
  }
}

export async function restoreDisputeCaseIfClear(
  manager: EntityManager,
  caseId: string,
) {
  const stillHeld = await manager.existsBy(DisputeIssue, {
    caseId,
    status: In([...OPEN_DISPUTE_STATES]),
  });
  if (stillHeld) return;
  const row = await manager.findOneByOrFail(DisputeCase, { id: caseId });
  row.state = DISPUTE_CASE_STATE.CLOSED;
  await manager.save(row);
  const order = await manager.findOneByOrFail(Order, { id: row.orderId });
  if (order.status === ORDER_STATUS.DISPUTE) {
    order.status = row.previousOrderStatus;
    await manager.save(order);
  }
}
