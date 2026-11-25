import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { DataSource, EntityManager, In } from 'typeorm';

import { OrderAccess } from '@/modules/order/order.access';
import { businessDeadline } from '@/modules/shipment/utils/business-calendar';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { DISPUTE_ACTION } from '../constants/dispute.constant';
import { decisionFingerprint } from '../dispute-decision-review';
import { DisputeAccess } from '../dispute.access';
import { notifyDispute } from '../dispute.lifecycle';
import { DisputeEvidence } from '../entities/dispute-evidence.entity';
import { DisputeFinalDecision } from '../entities/dispute-final-decision.entity';
import {
  RETURN_ACTION,
  RETURN_POLICY,
  RETURN_STATE,
} from './constants/return.constant';
import { DisputeReturn } from './entities/dispute-return.entity';
import { ReturnEvent } from './entities/return-event.entity';
import { ReturnEvidenceLink } from './entities/return-evidence-link.entity';
import {
  applyVerifiedHandoverClock,
  assertReturnResumable,
  resumedHandoverDeadline,
} from './policies/return-clock.policy';
import { recoverTimelyReturnRefunds } from './refund-return.integration';
import { reconcileReturnClock } from './return.lifecycle';
import {
  type ReturnActionData,
  type ReturnActionInput,
  returnActionSchema,
} from './schemas/return.schema';
import type { ReturnEvidenceKind } from './schemas/return.schema';

export type ReturnAction = (typeof RETURN_ACTION)[keyof typeof RETURN_ACTION];
const adminActions: ReturnAction[] = [
  RETURN_ACTION.VERIFY_OBSTACLE,
  RETURN_ACTION.REJECT_OBSTACLE,
  RETURN_ACTION.RESUME,
  RETURN_ACTION.HANDOVER,
  RETURN_ACTION.DELIVERY,
  RETURN_ACTION.EXTEND,
  RETURN_ACTION.RESOLVE,
  RETURN_ACTION.RECOVER_HANDOVER,
];

@Injectable()
export class DisputeReturnService {
  constructor(private readonly db: DataSource) {}

  private async lock(manager: EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(782143, 1)');
    const [{ now }] = await manager.query('SELECT clock_timestamp() AS now');
    return new Date(now);
  }

  private async token(manager: EntityManager, row: DisputeReturn) {
    const links = await manager.find(ReturnEvidenceLink, {
      where: { returnId: row.id },
      order: { evidenceId: 'ASC', kind: 'ASC' },
    });
    const evidence = links.length
      ? await manager.find(DisputeEvidence, {
          where: { id: In(links.map((link) => link.evidenceId)) },
          order: { id: 'ASC' },
        })
      : [];
    return decisionFingerprint({
      id: row.id,
      state: row.state,
      objectionAt: row.objectionAt,
      objectionDueAt: row.objectionDueAt,
      extendedAt: row.extendedAt,
      refundLimit: row.refundLimit,
      deliveredAt: row.deliveredAt,
      mode: row.mode,
      objectionReason: row.objectionReason,
      handoverAt: row.handoverAt,
      handoverBy: row.handoverBy,
      labelCode: row.labelCode,
      timelyHandoverReviewRequired: row.timelyHandoverReviewRequired,
      evidence: evidence.map((item) => ({
        id: item.id,
        mediaId: item.mediaId,
        tags: item.tags,
      })),
      links: links.map((link) => ({
        evidenceId: link.evidenceId,
        kind: link.kind,
      })),
    });
  }

  private async authorize(
    manager: EntityManager,
    row: DisputeReturn,
    userId: string,
    admin: boolean,
  ) {
    if (admin)
      return manager.findOneByOrFail(User, {
        id: userId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      });
    return new DisputeAccess(new OrderAccess()).assertParty(
      manager,
      userId,
      row.orderId,
    );
  }

  async read(userId: string, id: string, admin = false) {
    const manager = this.db.manager;
    const row = await manager.findOneByOrFail(DisputeReturn, { id });
    await this.authorize(manager, row, userId, admin);
    const links = await manager.find(ReturnEvidenceLink, {
      where: { returnId: row.id },
      order: { createdAt: 'ASC' },
    });
    const evidence = links.length
      ? await manager.find(DisputeEvidence, {
          where: { id: In(links.map((link) => link.evidenceId)) },
          order: { createdAt: 'ASC' },
        })
      : [];
    const events = await manager.find(ReturnEvent, {
      where: { returnId: row.id },
      order: { createdAt: 'ASC' },
    });
    const view = { ...row, evidence, evidenceLinks: links, events };
    return admin
      ? { returnCase: view, reviewToken: await this.token(manager, row) }
      : view;
  }

  async act(
    userId: string,
    id: string,
    action: ReturnAction,
    input: ReturnActionInput,
  ) {
    const parsed = returnActionSchema.parse(input);
    const data: ReturnActionData = {
      ...parsed,
      observedAt: parsed.observedAt ? new Date(parsed.observedAt) : undefined,
    };
    const fingerprint = decisionFingerprint({
      id,
      userId,
      action,
      ...data,
      evidenceIds: [...data.evidenceIds].sort(),
    });
    return this.db.transaction(async (manager) => {
      const now = await this.lock(manager);
      const row = await manager.findOneByOrFail(DisputeReturn, { id });
      await this.authorize(manager, row, userId, adminActions.includes(action));
      const replay = await manager.findOneBy(ReturnEvent, {
        requestId: data.requestId,
      });
      if (replay) {
        if (replay.requestFingerprint !== fingerprint)
          throw new ConflictException('Return request already used');
        return row;
      }
      await reconcileReturnClock(manager, row, now);
      await this.apply(manager, row, userId, action, data, now);
      await manager.save(row);
      await manager.save(
        ReturnEvent,
        manager.create(ReturnEvent, {
          returnId: id,
          requestId: data.requestId,
          actorId: userId,
          requestFingerprint: fingerprint,
          action,
          reason: data.reason,
          data: { ...data },
          createdAt: now,
        }),
      );
      const final = await manager.findOneByOrFail(DisputeFinalDecision, {
        id: row.finalDecisionId,
      });
      await notifyDispute(
        manager,
        final.issueId,
        DISPUTE_ACTION.RETURN_UPDATED,
        now,
        data.reason,
        data.requestId,
      );
      return row;
    });
  }

  private async evidence(
    manager: EntityManager,
    row: DisputeReturn,
    userId: string,
    data: ReturnActionData,
    kind: ReturnEvidenceKind,
    tags: string[] = [],
    admin = false,
  ) {
    if (!data.evidenceIds.length)
      throw new ConflictException('Evidence required');
    const ids = [...new Set(data.evidenceIds)];
    const evidence = await manager.find(DisputeEvidence, {
      where: { id: In(ids) },
    });
    if (
      evidence.length !== ids.length ||
      evidence.some(
        (e) =>
          e.orderId !== row.orderId || (!admin && e.uploadedById !== userId),
      )
    )
      throw new ConflictException(
        'Ready evidence from this order and actor required',
      );
    if (
      tags.some(
        (tag) =>
          !evidence.some(
            (e) => e.tags.includes(tag) && e.mimeType.startsWith('image/'),
          ),
      )
    )
      throw new ConflictException('Required photographs missing');
    for (const evidenceId of ids) {
      if (
        !(await manager.existsBy(ReturnEvidenceLink, {
          returnId: row.id,
          evidenceId,
          kind,
        }))
      )
        await manager.save(
          ReturnEvidenceLink,
          manager.create(ReturnEvidenceLink, {
            returnId: row.id,
            evidenceId,
            kind,
          }),
        );
    }
  }

  private async apply(
    manager: EntityManager,
    row: DisputeReturn,
    userId: string,
    action: ReturnAction,
    data: ReturnActionData,
    now: Date,
  ) {
    if (action === RETURN_ACTION.PACKING || action === RETURN_ACTION.OBSTACLE) {
      if (row.buyerId !== userId)
        throw new ForbiddenException('Buyer required');
      if (row.state !== RETURN_STATE.AWAITING_HANDOVER || row.handoverAt)
        throw new ConflictException('Return not awaiting handover');
      if (action === RETURN_ACTION.PACKING) {
        // Accessory photos remain accepted when applicable; missing accessories
        // can be raised in seller inspection and never establish fault automatically.
        if (data.labelCode !== row.labelCode)
          throw new ConflictException('Packing must identify return label');
        await this.evidence(manager, row, userId, data, RETURN_ACTION.PACKING, [
          'RETURN_ITEM',
          'RETURN_PACKED_LABEL',
        ]);
      } else {
        await this.evidence(manager, row, userId, data, RETURN_ACTION.OBSTACLE);
        row.obstaclePending = true;
        row.obstacleReportedAt = now;
        row.obstacleReason = data.reason;
      }
      return;
    }
    if (action === RETURN_ACTION.OBJECTION)
      return this.object(manager, row, userId, data, now);
    if (action === RETURN_ACTION.RECOVER_HANDOVER)
      return this.recoverHandover(manager, row, data, now);
    if (action === RETURN_ACTION.ACCEPT_INSPECTION) {
      await new OrderAccess().assertManage(manager, userId, row.shopId);
      if (row.state !== RETURN_STATE.INSPECTION)
        throw new ConflictException('Return not in inspection');
      row.state = RETURN_STATE.READY;
      row.readyAt = now;
      row.readyReason = 'SELLER_ACCEPTED_RETURN';
      return;
    }
    if (
      (
        [
          RETURN_ACTION.VERIFY_OBSTACLE,
          RETURN_ACTION.REJECT_OBSTACLE,
          RETURN_ACTION.RESUME,
        ] as ReturnAction[]
      ).includes(action)
    )
      return this.obstacle(row, action, data, now);
    if (action === RETURN_ACTION.HANDOVER || action === RETURN_ACTION.DELIVERY)
      return this.movement(manager, row, userId, action, data, now);
    if (action === RETURN_ACTION.EXTEND || action === RETURN_ACTION.RESOLVE)
      return this.resolve(manager, row, action, data, now);
    throw new ConflictException('Unsupported return action');
  }

  private obstacle(
    row: DisputeReturn,
    action: ReturnAction,
    data: ReturnActionData,
    now: Date,
  ) {
    if (action === RETURN_ACTION.RESUME) {
      assertReturnResumable(row);
      if (data.mode !== row.mode)
        throw new ConflictException('Return mode mismatch');
      row.handoverBy = resumedHandoverDeadline(Number(row.remainingMs), now);
      row.state = RETURN_STATE.AWAITING_HANDOVER;
      return;
    }
    if (!row.obstaclePending || row.state !== RETURN_STATE.AWAITING_HANDOVER)
      throw new ConflictException('No pending obstacle');
    if (action === RETURN_ACTION.VERIFY_OBSTACLE) {
      const at = data.observedAt;
      if (
        data.mode !== row.mode ||
        !at ||
        !row.labelNotifiedAt ||
        at < row.labelNotifiedAt ||
        at > now ||
        at > row.handoverBy!
      )
        throw new ConflictException(
          'Verified obstacle must be within handover window',
        );
      row.obstacleAt = at;
      row.pausedAt = now;
      row.remainingMs = Math.max(0, row.handoverBy!.getTime() - at.getTime());
      row.state = RETURN_STATE.PAUSED;
    }
    row.obstaclePending = false;
  }

  private async movement(
    manager: EntityManager,
    row: DisputeReturn,
    userId: string,
    action: ReturnAction,
    data: ReturnActionData,
    now: Date,
  ) {
    const at = data.observedAt;
    if (
      !row.labelCode ||
      data.labelCode !== row.labelCode ||
      data.mode !== row.mode ||
      !at ||
      at > now ||
      at < row.labelNotifiedAt!
    )
      throw new ConflictException(
        'Verified matching carrier observation required',
      );
    await this.evidence(manager, row, userId, data, 'MOVEMENT', [], true);
    if (action === RETURN_ACTION.HANDOVER) {
      if (row.handoverAt)
        throw new ConflictException('Handover already recorded');
      applyVerifiedHandoverClock(row, at);
      const proof = await manager.find(ReturnEvidenceLink, {
        where: { returnId: row.id, kind: RETURN_ACTION.PACKING },
      });
      row.packingMissing = !proof.some((link) => link.createdAt <= at);
    } else {
      if (!row.handoverAt || at < row.handoverAt || row.deliveredAt)
        throw new ConflictException('Handover before delivery required');
      row.deliveredAt = at;
      if (row.state === RETURN_STATE.IN_TRANSIT) {
        row.state = RETURN_STATE.INSPECTION;
        await reconcileReturnClock(manager, row, now);
      }
    }
  }

  private async object(
    manager: EntityManager,
    row: DisputeReturn,
    userId: string,
    data: ReturnActionData,
    now: Date,
  ) {
    await new OrderAccess().assertManage(manager, userId, row.shopId);
    if (
      row.state !== RETURN_STATE.INSPECTION ||
      (row.inspectionDueAt && now > row.inspectionDueAt)
    )
      throw new ConflictException('Inspection objection window not open');
    if (data.labelCode !== row.labelCode)
      throw new ConflictException('Return label required');
    await this.evidence(manager, row, userId, data, RETURN_ACTION.OBJECTION, [
      'RETURN_PARCEL',
      'RETURN_LABEL',
      'RETURN_RECEIVED_ITEMS',
    ]);
    row.state = RETURN_STATE.OBJECTION;
    row.objectionAt = now;
    row.objectionReason = data.reason;
    await reconcileReturnClock(manager, row, now);
  }

  private async recoverHandover(
    manager: EntityManager,
    row: DisputeReturn,
    data: ReturnActionData,
    now: Date,
  ) {
    if (data.reviewToken !== (await this.token(manager, row)))
      throw new ConflictException('Return review is stale');
    const effectivePauseAt = row.obstacleAt ?? row.pausedAt;
    const pausedMovement =
      row.state === RETURN_STATE.PAUSED &&
      effectivePauseAt &&
      row.handoverAt &&
      row.handoverAt >= effectivePauseAt &&
      row.remainingMs !== null;
    const reviewablePhase =
      row.state === RETURN_STATE.EXPIRED || row.state === RETURN_STATE.PAUSED;
    const timelyMovement =
      row.handoverAt &&
      row.handoverBy &&
      (row.handoverAt <= row.handoverBy || !!pausedMovement);
    if (
      !reviewablePhase ||
      !row.timelyHandoverReviewRequired ||
      !row.handoverAt ||
      !row.handoverBy ||
      !timelyMovement ||
      data.mode !== row.mode ||
      data.labelCode !== row.labelCode
    )
      throw new ConflictException(
        'Verified timely handover and matching parcel required',
      );
    await recoverTimelyReturnRefunds(manager, row, now);
    if (pausedMovement)
      row.handoverBy = resumedHandoverDeadline(
        Number(row.remainingMs),
        row.handoverAt,
      );
    row.state = row.deliveredAt
      ? RETURN_STATE.INSPECTION
      : RETURN_STATE.IN_TRANSIT;
    row.timelyHandoverReviewRequired = false;
    row.labelReplacementRequired = false;
    await reconcileReturnClock(manager, row, now);
  }

  private async resolve(
    manager: EntityManager,
    row: DisputeReturn,
    action: ReturnAction,
    data: ReturnActionData,
    now: Date,
  ) {
    if (row.state !== RETURN_STATE.OBJECTION)
      throw new ConflictException('Return has no objection');
    if (data.reviewToken !== (await this.token(manager, row)))
      throw new ConflictException('Return review is stale');
    if (action === RETURN_ACTION.EXTEND) {
      if (row.extendedAt)
        throw new ConflictException('Return objection already extended');
      row.extendedAt = now;
      row.extensionReason = data.reason;
      row.objectionDueAt = businessDeadline(
        row.objectionAt!,
        RETURN_POLICY.MAX_OBJECTION_BUSINESS_DAYS,
      );
      row.calendarMissing = !row.objectionDueAt;
      return;
    }
    if (!data.conclusion) throw new ConflictException('Conclusion required');
    const final = await manager.findOneByOrFail(DisputeFinalDecision, {
      id: row.finalDecisionId,
    });
    if (data.conclusion === 'BUYER_FAULT') {
      if (
        !data.evidenceIds.length ||
        data.refundLimit === undefined ||
        data.refundLimit > final.refundPlan!.amount
      )
        throw new ConflictException(
          'Verified item fault evidence and bounded refund limit required',
        );
      await this.evidence(
        manager,
        row,
        '',
        data,
        RETURN_ACTION.OBJECTION,
        [],
        true,
      );
      row.refundLimit = data.refundLimit;
    }
    row.state = RETURN_STATE.READY;
    row.readyAt = now;
    row.readyReason = data.conclusion;
  }
}
