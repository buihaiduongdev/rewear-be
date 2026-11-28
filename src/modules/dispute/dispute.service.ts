import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';
import { EVENT_TYPES } from '@/modules/event/constants/event-type.constant';
import { OutboxService } from '@/modules/event/outbox.service';
import { MediaService } from '@/modules/media/media.service';
import {
  ORDER_POLICY,
  ORDER_STATUS,
} from '@/modules/order/constants/order.constant';
import { Order } from '@/modules/order/entities';
import { OrderDeliveryVerification } from '@/modules/order/entities/order-delivery-verification.entity';
import { assertShopOrderManager } from '@/modules/order/order.service';
import { ShopSettlement } from '@/modules/shop-finance/entities/shop-settlement.entity';

import {
  businessDeadline,
  DISPUTE_CASE_STATE,
  DISPUTE_ISSUE_STATE,
  DISPUTE_PARTY,
  DISPUTE_POLICY,
  hasMinimumDisputeEvidence,
  OPEN_DISPUTE_STATES,
  RETURN_STATE,
} from './constants/dispute.constant';
import { DisputeAppeal } from './entities/dispute-appeal.entity';
import { DisputeCase } from './entities/dispute-case.entity';
import { DisputeDecision } from './entities/dispute-decision.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
import { DisputeIssue } from './entities/dispute-issue.entity';
import { DisputeMessage } from './entities/dispute-message.entity';
import { DisputeReturn } from './entities/dispute-return.entity';
import type {
  DisputeReplyInput,
  DisputeUploadInput,
  OpenDisputeIssueInput,
} from './schemas/dispute.schema';
import {
  disputeFileSchema,
  disputeReplySchema,
  disputeUploadSchema,
  openDisputeIssueSchema,
} from './schemas/dispute.schema';

export async function assertDisputeParty(
  manager: EntityManager,
  userId: string,
  orderId: string,
  existingOrder?: Order,
) {
  const order =
    existingOrder ?? (await manager.findOneByOrFail(Order, { id: orderId }));
  if (order.buyerId === userId) return { order, party: DISPUTE_PARTY.BUYER };
  await assertShopOrderManager(manager, userId, order.shopId);
  return { order, party: DISPUTE_PARTY.SELLER };
}

export async function isDisputeWindowOpen(
  manager: EntityManager,
  order: Order,
  now: Date,
) {
  const verification = await manager.findOneBy(OrderDeliveryVerification, {
    orderId: order.id,
  });
  if (!verification) return false;
  const matchesDelivery =
    order.deliveryVerifiedAt?.getTime() === verification.deliveredAt.getTime();
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

export async function assertDisputeUploadAllowed(
  manager: EntityManager,
  userId: string,
  orderId: string,
  now: Date,
  existingOrder?: Order,
) {
  const party = await assertDisputeParty(
    manager,
    userId,
    orderId,
    existingOrder,
  );
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
      (await isDisputeWindowOpen(manager, party.order, now)));
  const sellerCanUpload =
    party.party === DISPUTE_PARTY.SELLER &&
    (hasActiveIssue || canPrepareAppeal);
  if (!buyerCanUpload && !sellerCanUpload && !returnWindow) {
    throw new ConflictException('No open dispute evidence window');
  }
  return party;
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

@Injectable()
export class DisputeService {
  constructor(
    private readonly db: DataSource,
    private readonly storageService: StorageService,
    private readonly mediaService: MediaService,
    private readonly outboxService: OutboxService,
  ) {}

  async openIssue(
    buyerId: string,
    orderId: string,
    input: OpenDisputeIssueInput,
  ) {
    const data = openDisputeIssueSchema.parse(input);
    return this.db.transaction(async (manager) => {
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      const order = await manager.findOneOrFail(Order, {
        where: { id: orderId, buyerId },
        lock: { mode: 'pessimistic_write' },
      });
      let row = await manager.findOneBy(DisputeCase, { orderId });
      const existing =
        row &&
        (await manager.findOneBy(DisputeIssue, {
          caseId: row.id,
          productId: data.productId,
        }));
      if (existing) return existing;

      if (!(await isDisputeWindowOpen(manager, order, now))) {
        throw new ConflictException('Dispute window is closed or unverified');
      }
      if (await manager.existsBy(ShopSettlement, { orderId })) {
        throw new ConflictException('Order funds already released');
      }
      if (!order.items.some((item) => item.productId === data.productId)) {
        throw new ConflictException('Item does not belong to order');
      }

      const files = await this.verifyOwnedEvidence(
        manager,
        orderId,
        buyerId,
        data.evidenceIds,
      );
      if (
        !hasMinimumDisputeEvidence(
          data.kind,
          files.flatMap((file) => file.tags),
        )
      ) {
        throw new BadRequestException(
          'Minimum photo or unboxing video evidence required for this dispute kind',
        );
      }

      row ??= manager.create(DisputeCase, {
        orderId: order.id,
        buyerId: order.buyerId,
        shopId: order.shopId,
        previousOrderStatus: order.status,
        state: DISPUTE_CASE_STATE.CLOSED,
      });
      if (row.state !== DISPUTE_CASE_STATE.OPEN) {
        row.previousOrderStatus = order.status;
      }
      row.state = DISPUTE_CASE_STATE.OPEN;
      row = await manager.save(row);

      order.status = ORDER_STATUS.DISPUTE;
      await manager.save(order);

      const issue = await manager.save(
        DisputeIssue,
        manager.create(DisputeIssue, {
          caseId: row.id,
          productId: data.productId,
          kind: data.kind,
          description: data.description,
          evidenceIds: [...data.evidenceIds].sort(),
          status: DISPUTE_ISSUE_STATE.ACTIVE,
          sellerRespondBy: businessDeadline(
            now,
            DISPUTE_POLICY.SELLER_RESPONSE_BUSINESS_DAYS,
          ),
          reviewDueAt: businessDeadline(
            now,
            DISPUTE_POLICY.REVIEW_BUSINESS_DAYS,
          ),
          maxReviewDueAt: businessDeadline(
            now,
            DISPUTE_POLICY.MAX_REVIEW_BUSINESS_DAYS,
          ),
          extendedAt: null,
          extensionReason: null,
          reviewOverdue: false,
          createdAt: now,
        }),
      );
      await this.outboxService.record(manager, {
        eventType: EVENT_TYPES.DISPUTE_UPDATED,
        resourceId: row.id,
        payload: {
          disputeCaseId: row.id,
          orderId: row.orderId,
          buyerId: row.buyerId,
          shopId: row.shopId,
          event: `opened:${issue.id}`,
          includeAdmins: true,
          sendEmail: false,
        },
      });
      return issue;
    });
  }

  async reply(userId: string, issueId: string, input: DisputeReplyInput) {
    const data = disputeReplySchema.parse(input);
    return this.db.transaction(async (manager) => {
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      const row = await manager
        .createQueryBuilder(DisputeCase, 'c')
        .innerJoin(DisputeIssue, 'i', 'i.caseId = c.id AND i.id = :issueId', {
          issueId,
        })
        .getOneOrFail();
      const order = await manager.findOneOrFail(Order, {
        where: { id: row.orderId },
        lock: { mode: 'pessimistic_write' },
      });
      const issue = await manager.findOneOrFail(DisputeIssue, {
        where: { id: issueId },
        lock: { mode: 'pessimistic_write' },
      });
      const { party } = await assertDisputeParty(
        manager,
        userId,
        row.orderId,
        order,
      );
      if (issue.status !== DISPUTE_ISSUE_STATE.ACTIVE) {
        throw new ConflictException('Issue is not active for replies');
      }
      await this.verifyOwnedEvidence(
        manager,
        row.orderId,
        userId,
        data.evidenceIds,
      );
      return manager.save(
        DisputeMessage,
        manager.create(DisputeMessage, {
          issueId,
          actorId: userId,
          party,
          text: data.text,
          evidenceIds: [...data.evidenceIds].sort(),
          createdAt: now,
        }),
      );
    });
  }

  async attachEvidence(
    userId: string,
    orderId: string,
    input: DisputeUploadInput,
  ) {
    const parsed = disputeUploadSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Invalid evidence');
    return this.db.transaction(async (manager) => {
      const [{ now: clock }] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const now = new Date(clock);
      const order = await manager.findOneOrFail(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      await assertDisputeUploadAllowed(manager, userId, orderId, now, order);
      const repo = manager.getRepository(DisputeEvidence);
      const existing = await repo.findOneBy({
        orderId,
        uploadedById: userId,
        mediaId: parsed.data.mediaId,
      });
      if (existing) {
        return {
          id: existing.id,
          mimeType: existing.mimeType,
          sizeBytes: existing.sizeBytes,
          tags: existing.tags,
        };
      }
      if (
        (await repo.countBy({ orderId, uploadedById: userId })) >=
        DISPUTE_POLICY.MAX_EVIDENCE_PER_ORDER_USER
      ) {
        throw new BadRequestException('Evidence limit reached');
      }
      const file = await this.mediaService.verifyMedia(
        manager,
        userId,
        parsed.data.mediaId,
        undefined,
        'private',
      );
      if (
        !disputeFileSchema.safeParse({
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        }).success
      ) {
        throw new BadRequestException('Invalid evidence file');
      }
      const row = await repo.save(
        repo.create({
          orderId,
          uploadedById: userId,
          mediaId: file.id,
          tags: parsed.data.tags,
        }),
      );
      return {
        id: row.id,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        tags: row.tags,
      };
    });
  }

  async downloadEvidence(userId: string, evidenceId: string) {
    const manager = this.db.manager;
    const row = await manager.findOneByOrFail(DisputeEvidence, {
      id: evidenceId,
    });
    if (row.media.retiredAt) {
      throw new NotFoundException('Evidence not found');
    }
    await assertDisputeParty(manager, userId, row.orderId);
    if (row.uploadedById !== userId) {
      const submitted = await this.isEvidenceSubmitted(
        manager,
        row.orderId,
        evidenceId,
      );
      if (!submitted) {
        throw new ForbiddenException('Evidence has not been submitted');
      }
    }
    return this.storageService.createDownloadUrl(row.media.storageKey);
  }

  async adminDownloadEvidence(evidenceId: string) {
    const row = await this.db.manager.findOneByOrFail(DisputeEvidence, {
      id: evidenceId,
    });
    if (row.media.retiredAt) {
      throw new NotFoundException('Evidence not found');
    }
    return this.storageService.createDownloadUrl(row.media.storageKey);
  }

  buyerList(buyerId: string, offset = 0) {
    return this.list({ buyerId }, offset);
  }

  adminList(offset = 0) {
    return this.list({}, offset);
  }

  async shopList(userId: string, shopId: string, offset = 0) {
    await assertShopOrderManager(this.db.manager, userId, shopId);
    return this.list({ shopId }, offset);
  }

  async byOrder(userId: string, orderId: string, offset = 0) {
    const manager = this.db.manager;
    await assertDisputeParty(manager, userId, orderId);
    const row = await manager.findOneByOrFail(DisputeCase, { orderId });
    return this.detail(manager, row, offset);
  }

  async adminDetail(caseId: string, offset = 0) {
    const manager = this.db.manager;
    const row = await manager.findOneByOrFail(DisputeCase, { id: caseId });
    return this.detail(manager, row, offset);
  }

  private async list(
    scope: { buyerId?: string; shopId?: string },
    offset: number,
  ) {
    const manager = this.db.manager;
    const rows = await manager.find(DisputeCase, {
      where: scope,
      order: { createdAt: 'DESC', id: 'DESC' },
      take: DISPUTE_POLICY.BATCH_SIZE,
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

  private async detail(
    manager: EntityManager,
    row: DisputeCase,
    offset: number,
  ) {
    const issues = await manager.find(DisputeIssue, {
      where: { caseId: row.id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const issueIds = issues.map((issue) => issue.id);
    if (!issueIds.length) {
      return {
        ...row,
        issues,
        messages: [],
        evidence: [],
        decisions: [],
        appeals: [],
        returns: [],
      };
    }
    const [messages, decisions, returns] = await Promise.all([
      manager.find(DisputeMessage, {
        where: { issueId: In(issueIds) },
        order: { createdAt: 'ASC', id: 'ASC' },
        take: DISPUTE_POLICY.BATCH_SIZE,
        skip: offset,
      }),
      manager.find(DisputeDecision, {
        where: { issueId: In(issueIds) },
        order: { decidedAt: 'ASC', id: 'ASC' },
      }),
      manager.find(DisputeReturn, {
        where: { orderId: row.orderId },
        order: { createdAt: 'ASC', id: 'ASC' },
      }),
    ]);
    const decisionIds = decisions.map((decision) => decision.id);
    const appeals = decisionIds.length
      ? await manager.find(DisputeAppeal, {
          where: { decisionId: In(decisionIds) },
          order: { filedAt: 'ASC', id: 'ASC' },
        })
      : [];
    const evidenceIds = [
      ...new Set([
        ...issues.flatMap((issue) => issue.evidenceIds),
        ...messages.flatMap((message) => message.evidenceIds),
        ...appeals.flatMap((appeal) => appeal.evidenceIds),
      ]),
    ];
    const evidence = evidenceIds.length
      ? (
          await manager.find(DisputeEvidence, {
            where: { id: In(evidenceIds) },
          })
        ).filter((file) => !file.media.retiredAt)
      : [];

    return {
      ...row,
      issues,
      messages,
      evidence,
      decisions,
      appeals,
      returns,
    };
  }

  private async verifyOwnedEvidence(
    manager: EntityManager,
    orderId: string,
    userId: string,
    ids: string[],
  ) {
    if (!ids.length) return [];
    const files = await manager.find(DisputeEvidence, {
      where: { id: In(ids), orderId, uploadedById: userId },
    });
    if (files.length !== ids.length) {
      throw new ConflictException(
        'Evidence must be confirmed and belong to this order and uploader',
      );
    }
    return files;
  }

  private async isEvidenceSubmitted(
    manager: EntityManager,
    orderId: string,
    evidenceId: string,
  ) {
    const dispute = await manager.findOneBy(DisputeCase, { orderId });
    if (!dispute) return false;
    const issues = await manager.find(DisputeIssue, {
      where: { caseId: dispute.id },
    });
    if (issues.some((issue) => issue.evidenceIds.includes(evidenceId))) {
      return true;
    }
    const issueIds = issues.map((issue) => issue.id);
    if (!issueIds.length) return false;
    const inMessage = await manager
      .getRepository(DisputeMessage)
      .createQueryBuilder('message')
      .where('message."issueId" IN (:...issueIds)', { issueIds })
      .andWhere('message."evidenceIds" @> CAST(:ids AS jsonb)', {
        ids: JSON.stringify([evidenceId]),
      })
      .getExists();
    if (inMessage) return true;
    const decisions = await manager.find(DisputeDecision, {
      select: { id: true },
      where: { issueId: In(issueIds) },
    });
    const decisionIds = decisions.map((decision) => decision.id);
    if (!decisionIds.length) return false;
    return manager
      .getRepository(DisputeAppeal)
      .createQueryBuilder('appeal')
      .where('appeal."decisionId" IN (:...decisionIds)', { decisionIds })
      .andWhere('appeal."evidenceIds" @> CAST(:ids AS jsonb)', {
        ids: JSON.stringify([evidenceId]),
      })
      .getExists();
  }
}
