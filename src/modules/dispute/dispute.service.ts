import { ConflictException, Injectable } from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { ORDER_STATUS } from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities/order.entity';
import { OrderAccess } from '@/modules/order/order.access';
import { ShopSettlement } from '@/modules/shop-finance/entities/shop-settlement.entity';

import {
  DISPUTE_ACTION,
  DISPUTE_CASE_STATE,
  DISPUTE_ISSUE_STATE,
  DISPUTE_PARTY,
  DISPUTE_POLICY,
} from './constants/dispute.constant';
import { DisputeAccess } from './dispute.access';
import {
  activateDisputeIssue,
  notifyDispute,
  populateDisputeDeadlines,
  recordDisputeAction,
} from './dispute.lifecycle';
import {
  DisputeAttachment,
  DisputeCase,
  DisputeEvidence,
  DisputeIssue,
  DisputeMessage,
} from './entities/dispute.entity';
import {
  disputeReplySchema,
  disputeSupplementSchema,
  openDisputeIssueSchema,
} from './schemas/dispute.schema';
import type {
  DisputeReplyInput,
  DisputeSupplementInput,
  OpenDisputeIssueInput,
} from './types/dispute.type';

@Injectable()
export class DisputeService {
  private readonly parties: DisputeAccess;
  constructor(
    private readonly db: DataSource,
    access: OrderAccess,
  ) {
    this.parties = new DisputeAccess(access);
  }

  private async lock(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }

  async openIssue(
    buyerId: string,
    orderId: string,
    input: OpenDisputeIssueInput,
  ) {
    const data = openDisputeIssueSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const order = await manager.findOneByOrFail(Order, {
        id: orderId,
        buyerId,
      });
      let row = await manager.findOneBy(DisputeCase, { orderId });
      const existing =
        row &&
        (await manager.findOneBy(DisputeIssue, {
          caseId: row.id,
          productId: data.productId,
          kind: data.kind,
        }));
      if (existing) return existing;
      const windowOpen = await this.parties.windowOpen(manager, order, now);
      if (!windowOpen)
        throw new ConflictException('Dispute window is closed or unverified');
      const alreadyReleased = await manager.existsBy(ShopSettlement, {
        orderId,
      });
      if (alreadyReleased)
        throw new ConflictException(
          'Order funds already released; review required',
        );
      if (!order.items.some((item) => item.productId === data.productId))
        throw new ConflictException('Item does not belong to order');
      row = await this.ensureCase(manager, order, row);
      const issue = await manager.save(
        DisputeIssue,
        manager.create(DisputeIssue, {
          caseId: row.id,
          productId: data.productId,
          kind: data.kind,
          description: data.description,
          status: DISPUTE_ISSUE_STATE.NEEDS_EVIDENCE,
          supplementBy: new Date(
            now.getTime() + DISPUTE_POLICY.SUPPLEMENT_WINDOW_MS,
          ),
          createdAt: now,
        }),
      );
      order.status = ORDER_STATUS.DISPUTE;
      await manager.save(order);
      await this.attach(manager, issue, order.id, buyerId, data.evidenceIds);
      await recordDisputeAction(
        manager,
        issue.id,
        DISPUTE_ACTION.OPENED,
        buyerId,
        now,
      );
      await notifyDispute(
        manager,
        issue.id,
        DISPUTE_ACTION.OPENED,
        now,
        'Issue received; funds held while evidence is checked',
      );
      await activateDisputeIssue(manager, issue, buyerId, now);
      return issue;
    });
  }

  private async ensureCase(
    manager: EntityManager,
    order: Order,
    row: DisputeCase | null,
  ) {
    row ??= manager.create(DisputeCase, {
      orderId: order.id,
      buyerId: order.buyerId,
      shopId: order.shopId,
    });
    if (row.state !== DISPUTE_CASE_STATE.OPEN)
      row.previousOrderStatus = order.status;
    row.state = DISPUTE_CASE_STATE.OPEN;
    return manager.save(row);
  }

  async supplement(
    buyerId: string,
    issueId: string,
    input: DisputeSupplementInput,
  ) {
    const data = disputeSupplementSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const issue = await manager.findOneByOrFail(DisputeIssue, {
        id: issueId,
      });
      const row = await manager.findOneByOrFail(DisputeCase, {
        id: issue.caseId,
        buyerId,
      });
      const expired =
        issue.status === DISPUTE_ISSUE_STATE.NEEDS_EVIDENCE &&
        now >= issue.supplementBy;
      const isClosed = issue.status === DISPUTE_ISSUE_STATE.CLOSED_INCOMPLETE;
      const decisionRecorded =
        issue.status !== DISPUTE_ISSUE_STATE.NEEDS_EVIDENCE &&
        issue.status !== DISPUTE_ISSUE_STATE.ACTIVE &&
        issue.status !== DISPUTE_ISSUE_STATE.CLOSED_INCOMPLETE;
      if (decisionRecorded)
        throw new ConflictException(
          'Initial decision is recorded; submit new evidence through appeal',
        );
      if (expired || isClosed)
        throw new ConflictException(
          'Supplement window closed; the original deadline cannot be reset',
        );
      await this.attach(manager, issue, row.orderId, buyerId, data.evidenceIds);
      await recordDisputeAction(
        manager,
        issue.id,
        DISPUTE_ACTION.SUPPLEMENTED,
        buyerId,
        now,
      );
      await activateDisputeIssue(manager, issue, buyerId, now);
      return issue;
    });
  }

  async reply(userId: string, issueId: string, input: DisputeReplyInput) {
    const data = disputeReplySchema.parse(input);
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const issue = await manager.findOneByOrFail(DisputeIssue, {
        id: issueId,
      });
      const row = await manager.findOneByOrFail(DisputeCase, {
        id: issue.caseId,
      });
      const { party } = await this.parties.assertParty(
        manager,
        userId,
        row.orderId,
      );
      const existing = await manager.findOneBy(DisputeMessage, {
        issueId,
        requestId: data.requestId,
      });
      if (existing) {
        const matches =
          existing.actorId === userId &&
          existing.text === data.text &&
          JSON.stringify(existing.evidenceIds) ===
            JSON.stringify([...data.evidenceIds].sort());
        if (!matches)
          throw new ConflictException(
            'Reply request was already used with different input',
          );
        return existing;
      }
      if (issue.status !== DISPUTE_ISSUE_STATE.ACTIVE)
        throw new ConflictException(
          'Issue is not active; use evidence supplementation first',
        );
      await populateDisputeDeadlines(manager, issue);
      await manager.save(issue);
      await this.attach(manager, issue, row.orderId, userId, data.evidenceIds);
      const late =
        party === DISPUTE_PARTY.SELLER
          ? issue.sellerRespondBy
            ? now > issue.sellerRespondBy
            : null
          : false;
      const message = await manager.save(
        DisputeMessage,
        manager.create(DisputeMessage, {
          issueId,
          requestId: data.requestId,
          actorId: userId,
          party,
          text: data.text,
          evidenceIds: [...data.evidenceIds].sort(),
          late,
          createdAt: now,
        }),
      );
      await recordDisputeAction(
        manager,
        issueId,
        DISPUTE_ACTION.REPLIED,
        userId,
        now,
      );
      return message;
    });
  }

  private async attach(
    manager: EntityManager,
    issue: DisputeIssue,
    orderId: string,
    userId: string,
    ids: string[],
  ) {
    if (!ids.length) return;
    const evidence = await manager.find(DisputeEvidence, {
      where: {
        id: In(ids),
        orderId,
        uploadedById: userId,
      },
    });
    if (evidence.length !== ids.length)
      throw new ConflictException(
        'Evidence must be confirmed and belong to this order and uploader',
      );
    for (const evidenceId of ids) {
      const existing = await manager.existsBy(DisputeAttachment, {
        issueId: issue.id,
        evidenceId,
      });
      if (!existing)
        await manager.save(
          DisputeAttachment,
          manager.create(DisputeAttachment, { issueId: issue.id, evidenceId }),
        );
    }
  }
}
