import { ConflictException } from '@nestjs/common';

import { EntityManager, In } from 'typeorm';

import { DISPUTE_EVIDENCE_STATE } from './constants/dispute.constant';
import {
  decisionFingerprint,
  loadDecisionReview,
} from './dispute-decision-review';
import {
  DisputeAppeal,
  DisputeAppealReview,
  DisputeFinalDecision,
} from './entities/dispute-appeal.entity';
import { DisputeDecision } from './entities/dispute-decision.entity';
import { DisputeEvidence } from './entities/dispute.entity';

export async function loadAppealReview(
  manager: EntityManager,
  decisionId: string,
) {
  const decision = await manager.findOneByOrFail(DisputeDecision, {
    id: decisionId,
  });
  const original = await loadDecisionReview(manager, decision.issueId);
  const appeals = await manager.find(DisputeAppeal, {
    where: { decisionId },
    order: { filedAt: 'ASC', id: 'ASC' },
  });
  const ids = [
    ...new Set(appeals.flatMap((appeal) => appeal.evidenceIds)),
  ].sort();
  const evidence = ids.length
    ? await manager.find(DisputeEvidence, {
        where: {
          id: In(ids),
          orderId: original.order.id,
          status: DISPUTE_EVIDENCE_STATE.READY,
        },
        order: { id: 'ASC' },
      })
    : [];
  if (evidence.length !== ids.length)
    throw new ConflictException('Appeal evidence snapshot requires review');
  const review = await manager.findOneBy(DisputeAppealReview, { decisionId });
  const finalDecision = await manager.findOneBy(DisputeFinalDecision, {
    decisionId,
  });
  const reviewToken = decisionFingerprint({
    original: original.reviewToken,
    initial: {
      id: decision.id,
      outcome: decision.outcome,
      refundPlan: decision.refundPlan ?? null,
      responsibility: decision.responsibility,
      reason: decision.reason,
      basis: decision.basis,
      appealUntil: decision.appealUntil,
    },
    appeals: appeals.map((appeal) => ({
      id: appeal.id,
      party: appeal.party,
      actorId: appeal.actorId,
      reason: appeal.reason,
      specificError: appeal.specificError,
      evidenceIds: appeal.evidenceIds,
      filedAt: appeal.filedAt,
      eligibility: appeal.eligibility,
    })),
    evidence: evidence.map((file) => ({
      id: file.id,
      eTag: file.eTag,
      tags: file.tags,
      readyAt: file.readyAt,
    })),
    reviewStartAt: review?.reviewStartAt,
    reviewDueAt: review?.reviewDueAt,
    finalId: finalDecision?.id,
  });
  const allEvidence = [
    ...new Map(
      [...original.evidence, ...evidence].map((file) => [file.id, file]),
    ).values(),
  ];
  return {
    ...original,
    decision,
    appeals,
    evidence: allEvidence,
    review,
    finalDecision,
    reviewToken,
  };
}
