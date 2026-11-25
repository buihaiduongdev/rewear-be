import { Injectable } from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { OrderAccess } from '@/modules/order/order.access';

import {
  DISPUTE_NOTICE_AUDIENCE,
  DISPUTE_PARTY,
} from './constants/dispute.constant';
import { DisputeAccess } from './dispute.access';
import { DisputeAppealEvidence } from './entities/dispute-appeal-evidence.entity';
import { DisputeAppealReview } from './entities/dispute-appeal-review.entity';
import { DisputeAppeal } from './entities/dispute-appeal.entity';
import { DisputeAttachment } from './entities/dispute-attachment.entity';
import { DisputeCase } from './entities/dispute-case.entity';
import { DisputeDecision } from './entities/dispute-decision.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
import { DisputeFinalDecision } from './entities/dispute-final-decision.entity';
import { DisputeIssue } from './entities/dispute-issue.entity';
import { DisputeMessage } from './entities/dispute-message.entity';
import { DisputeNotice } from './entities/dispute-notice.entity';

@Injectable()
export class DisputeReadService {
  constructor(
    private readonly db: DataSource,
    private readonly access: DisputeAccess,
    private readonly orders: OrderAccess,
  ) {}

  buyerList(buyerId: string, offset = 0) {
    return this.list({ buyerId }, offset);
  }
  adminList(offset = 0) {
    return this.list({}, offset);
  }
  async shopList(userId: string, shopId: string, offset = 0) {
    await this.orders.assertManage(this.db.manager, userId, shopId);
    return this.list({ shopId }, offset);
  }
  private async list(
    scope: { buyerId?: string; shopId?: string },
    offset: number,
  ) {
    const manager = this.db.manager;
    const rows = await manager.find(DisputeCase, {
      where: scope,
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
      skip: offset,
    });
    if (!rows.length) return [];
    const issues = await manager.find(DisputeIssue, {
      where: { caseId: In(rows.map((row) => row.id)) },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return rows.map((row) => ({
      ...row,
      issues: issues.filter((issue) => issue.caseId === row.id),
    }));
  }
  async byOrder(userId: string, orderId: string, offset = 0) {
    const manager = this.db.manager;
    const { party } = await this.access.assertParty(manager, userId, orderId);
    const row = await manager.findOneByOrFail(DisputeCase, { orderId });
    const audience =
      party === DISPUTE_PARTY.BUYER
        ? DISPUTE_NOTICE_AUDIENCE.BUYER
        : DISPUTE_NOTICE_AUDIENCE.SHOP;
    return this.detail(manager, row, audience, offset);
  }
  async adminDetail(caseId: string, offset = 0) {
    const manager = this.db.manager;
    return this.detail(
      manager,
      await manager.findOneByOrFail(DisputeCase, { id: caseId }),
      DISPUTE_NOTICE_AUDIENCE.ADMIN,
      offset,
    );
  }
  private async detail(
    manager: EntityManager,
    row: DisputeCase,
    audience: (typeof DISPUTE_NOTICE_AUDIENCE)[keyof typeof DISPUTE_NOTICE_AUDIENCE],
    offset: number,
  ) {
    const issues = await manager.find(DisputeIssue, {
      where: { caseId: row.id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const issueIds = issues.map((issue) => issue.id);
    if (!issueIds.length)
      return {
        ...row,
        issues,
        messages: [],
        evidence: [],
        attachments: [],
        notices: [],
        decisions: [],
        appeals: [],
        appealAttachments: [],
        appealReviews: [],
        finalDecisions: [],
      };
    const messages = await manager.find(DisputeMessage, {
      where: { issueId: In(issueIds) },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
      skip: offset,
    });
    const attachments = await manager.find(DisputeAttachment, {
      where: { issueId: In(issueIds) },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const {
      decisions,
      appeals,
      appealAttachments,
      appealReviews,
      finalDecisions,
    } = await this.decisionHistory(manager, issueIds);
    const evidenceIds = [
      ...new Set([
        ...attachments.map((attachment) => attachment.evidenceId),
        ...appealAttachments.map((attachment) => attachment.evidenceId),
      ]),
    ];
    const evidence = evidenceIds.length
      ? await manager.find(DisputeEvidence, { where: { id: In(evidenceIds) } })
      : [];
    const notices = await manager.find(DisputeNotice, {
      where: { issueId: In(issueIds), audience },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
      skip: offset,
    });
    return {
      ...row,
      issues,
      messages,
      evidence,
      attachments,
      notices,
      decisions,
      appeals,
      appealAttachments,
      appealReviews,
      finalDecisions,
    };
  }
  private async decisionHistory(manager: EntityManager, issueIds: string[]) {
    const decisions = await manager.find(DisputeDecision, {
      where: { issueId: In(issueIds) },
      order: { decidedAt: 'ASC', id: 'ASC' },
    });
    const decisionIds = decisions.map((decision) => decision.id);
    const appeals = decisionIds.length
      ? await manager.find(DisputeAppeal, {
          where: { decisionId: In(decisionIds) },
          order: { filedAt: 'ASC', id: 'ASC' },
        })
      : [];
    const appealIds = appeals.map((appeal) => appeal.id);
    const appealAttachments = appealIds.length
      ? await manager.find(DisputeAppealEvidence, {
          where: { appealId: In(appealIds) },
          order: { id: 'ASC' },
        })
      : [];
    const appealReviews = decisionIds.length
      ? await manager.find(DisputeAppealReview, {
          where: { decisionId: In(decisionIds) },
        })
      : [];
    const finalDecisions = decisionIds.length
      ? await manager.find(DisputeFinalDecision, {
          where: { decisionId: In(decisionIds) },
        })
      : [];
    return {
      decisions,
      appeals,
      appealAttachments,
      appealReviews,
      finalDecisions,
    };
  }
}
