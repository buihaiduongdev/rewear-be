import { ConflictException } from '@nestjs/common';

import {
  DataSource,
  EntityManager,
  EntityTarget,
  FindOptionsWhere,
  In,
} from 'typeorm';

import { Order } from '@/modules/order/entities';
import { OrderAccess } from '@/modules/order/order.access';
import { User } from '@/modules/user/entities';
import { UserRole, UserStatus } from '@/modules/user/enums';

import { DISPUTE_ACTION } from '../constants/dispute.constant';
import { decisionFingerprint } from '../dispute-decision-review';
import { DisputeAccess } from '../dispute.access';
import { notifyDispute } from '../dispute.lifecycle';
import { DisputeCase } from '../entities/dispute-case.entity';
import { DisputeEvidence } from '../entities/dispute-evidence.entity';
import { DisputeFinalDecision } from '../entities/dispute-final-decision.entity';
import { DisputeIssue } from '../entities/dispute-issue.entity';
import { DisputeRemedyEvent } from './entities/dispute-remedy-event.entity';
import { DisputeRemedyEvidenceLink } from './entities/dispute-remedy-evidence-link.entity';
import { DisputeReturn } from './entities/dispute-return.entity';
import { DisputeSafetyWaiver } from './entities/dispute-safety-waiver.entity';

export async function remedyContext(manager: EntityManager, finalId: string) {
  const final = await manager.findOneByOrFail(DisputeFinalDecision, {
    id: finalId,
  });
  const issue = await manager.findOneByOrFail(DisputeIssue, {
    id: final.issueId,
  });
  const row = await manager.findOneByOrFail(DisputeCase, { id: issue.caseId });
  const order = await manager.findOneByOrFail(Order, { id: row.orderId });
  if (
    !final.refundPlan ||
    final.remedyKey !== `${order.id}:${issue.productId}` ||
    row.buyerId !== order.buyerId ||
    row.shopId !== order.shopId
  )
    throw new ConflictException('Final remedy source requires review');
  return { final, issue, row, order };
}
export type RemedyContext = Awaited<ReturnType<typeof remedyContext>>;
export async function remedyReviewToken(
  manager: EntityManager,
  context: RemedyContext,
) {
  const returned = await manager.findOneBy(DisputeReturn, {
    remedyKey: context.final.remedyKey,
  });
  const safety = await manager.findOneBy(DisputeSafetyWaiver, {
    finalDecisionId: context.final.id,
  });
  const files = await manager.find(DisputeEvidence, {
    where: { orderId: context.order.id },
    order: { id: 'ASC' },
  });
  return decisionFingerprint({
    final: context.final,
    order: context.order,
    returned,
    safety,
    files: files.map((f) => ({
      id: f.id,
      mediaId: f.mediaId,
      tags: f.tags,
    })),
  });
}
export async function linkRemedyEvidence(
  manager: EntityManager,
  orderId: string,
  recordId: string,
  ids: string[],
  uploaderId?: string,
) {
  const files = await manager.find(DisputeEvidence, {
    where: {
      id: In(ids),
      orderId,
      ...(uploaderId ? { uploadedById: uploaderId } : {}),
    },
  });
  if (!ids.length || files.length !== ids.length)
    throw new ConflictException(
      'Evidence must be READY and belong to this order/uploader',
    );
  for (const id of ids) {
    if (
      await manager.existsBy(DisputeRemedyEvidenceLink, {
        recordId,
        evidenceId: id,
      })
    )
      continue;
    await manager.save(
      DisputeRemedyEvidenceLink,
      manager.create(DisputeRemedyEvidenceLink, {
        recordId,
        orderId,
        evidenceId: id,
      }),
    );
  }
}
export async function runRemedyCommand<T extends { id: string }>(
  db: DataSource,
  actorId: string,
  finalId: string,
  action: string,
  data: { requestId: string; [key: string]: unknown },
  admin: boolean,
  entity: EntityTarget<T>,
  mutate: (
    manager: EntityManager,
    context: RemedyContext,
    now: Date,
  ) => Promise<T>,
) {
  const fingerprint = decisionFingerprint({ actorId, finalId, action, data });
  return db.transaction(async (manager) => {
    const [{ now: clock }] = await manager.query(
      'SELECT clock_timestamp() AS now',
    );
    const now = new Date(clock),
      context = await remedyContext(manager, finalId);
    if (admin)
      await manager.findOneByOrFail(User, {
        id: actorId,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      });
    else
      await new DisputeAccess(new OrderAccess()).assertParty(
        manager,
        actorId,
        context.order.id,
      );
    const replay = await manager.findOneBy(DisputeRemedyEvent, {
      requestId: data.requestId,
    });
    if (replay) {
      if (replay.fingerprint !== fingerprint)
        throw new ConflictException(
          'Remedy request already used with different input',
        );
      return manager.findOneByOrFail(entity, {
        id: replay.recordId,
      } as FindOptionsWhere<T>);
    }
    const result = await mutate(manager, context, now);
    await manager.save(
      DisputeRemedyEvent,
      manager.create(DisputeRemedyEvent, {
        requestId: data.requestId,
        actorId,
        finalDecisionId: finalId,
        action,
        fingerprint,
        recordId: result.id,
        createdAt: now,
      }),
    );
    await notifyDispute(
      manager,
      context.issue.id,
      DISPUTE_ACTION.RETURN_EXCEPTION,
      now,
      action,
      data.requestId,
    );
    return result;
  });
}
