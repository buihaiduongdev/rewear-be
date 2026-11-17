import { Injectable } from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { OrderAccess } from '@/modules/order/order.access';

import {
  DISPUTE_NOTICE_AUDIENCE,
  DISPUTE_PARTY,
} from './constants/dispute.constant';
import { DisputeAccess } from './dispute.access';
import {
  DisputeAttachment,
  DisputeCase,
  DisputeEvidence,
  DisputeIssue,
  DisputeMessage,
  DisputeNotice,
} from './entities/dispute.entity';

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
  private list(scope: { buyerId?: string; shopId?: string }, offset: number) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
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
    });
  }
  byOrder(userId: string, orderId: string, offset = 0) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const { party } = await this.access.assertParty(manager, userId, orderId);
      const row = await manager.findOneByOrFail(DisputeCase, { orderId });
      const audience =
        party === DISPUTE_PARTY.BUYER
          ? DISPUTE_NOTICE_AUDIENCE.BUYER
          : DISPUTE_NOTICE_AUDIENCE.SHOP;
      return this.detail(manager, row, audience, offset);
    });
  }
  adminDetail(caseId: string, offset = 0) {
    return this.db.transaction('REPEATABLE READ', async (manager) =>
      this.detail(
        manager,
        await manager.findOneByOrFail(DisputeCase, { id: caseId }),
        DISPUTE_NOTICE_AUDIENCE.ADMIN,
        offset,
      ),
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
    const evidenceIds = [
      ...new Set(attachments.map((attachment) => attachment.evidenceId)),
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
    return { ...row, issues, messages, evidence, attachments, notices };
  }
}
