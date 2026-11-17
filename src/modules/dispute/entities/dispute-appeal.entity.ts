import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type {
  DisputeAppealEligibility,
  DisputeFinalSource,
} from '../types/dispute-appeal.type';
import type {
  DisputeDecisionOutcome,
  DisputeResponsibility,
} from '../types/dispute-decision.type';
import type { DisputeParty } from '../types/dispute.type';
import { DisputeDecision } from './dispute-decision.entity';
import { DisputeEvidence } from './dispute.entity';

@Entity('dispute_appeals')
@Index(['decisionId', 'party'], { unique: true })
@Index(['requestId'], { unique: true })
export class DisputeAppeal extends BaseEntity {
  @Column('uuid')
  decisionId: string;

  @ManyToOne(() => DisputeDecision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'decisionId' })
  decision: DisputeDecision;

  @Column('uuid')
  requestId: string;

  @Column('uuid')
  actorId: string;

  @Column({ type: 'varchar', length: 16 })
  party: DisputeParty;

  @Column({ type: 'varchar', length: 64 })
  requestFingerprint: string;

  @Column('text')
  reason: string;

  @Column({ type: 'text', nullable: true })
  specificError: string | null;

  @Column('jsonb')
  evidenceIds: string[];

  @Column('timestamptz')
  filedAt: Date;

  @Column({ type: 'varchar', length: 24 })
  eligibility: DisputeAppealEligibility;
}

@Entity('dispute_appeal_evidence')
@Index(['appealId', 'evidenceId'], { unique: true })
export class DisputeAppealEvidence extends BaseEntity {
  @Column('uuid')
  appealId: string;

  @ManyToOne(() => DisputeAppeal, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'appealId' })
  appeal: DisputeAppeal;

  @Column('uuid')
  evidenceId: string;

  @ManyToOne(() => DisputeEvidence, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'evidenceId' })
  evidence: DisputeEvidence;
}

@Entity('dispute_appeal_reviews')
@Index(['decisionId'], { unique: true })
export class DisputeAppealReview extends BaseEntity {
  @Column('uuid')
  decisionId: string;

  @ManyToOne(() => DisputeDecision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'decisionId' })
  decision: DisputeDecision;

  @Column({ type: 'timestamptz', nullable: true })
  reviewStartAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewDueAt: Date | null;

  @Column({ default: false })
  calendarMissing: boolean;

  @Column({ default: false })
  reviewOverdue: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  escalatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  escalationDueAt: Date | null;
}

@Entity('dispute_final_decisions')
@Index(['decisionId'], { unique: true })
@Index(['requestId'], { unique: true })
export class DisputeFinalDecision extends BaseEntity {
  @Column('uuid')
  decisionId: string;

  @ManyToOne(() => DisputeDecision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'decisionId' })
  decision: DisputeDecision;

  @Column('uuid')
  issueId: string;

  @Column({ type: 'uuid', nullable: true })
  requestId: string | null;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  requestFingerprint: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  reviewToken: string | null;

  @Column({ type: 'varchar', length: 24 })
  source: DisputeFinalSource;

  @Column({ type: 'varchar', length: 24 })
  outcome: DisputeDecisionOutcome;

  @Column({ type: 'varchar', length: 16 })
  responsibility: DisputeResponsibility;

  @Column('text')
  reason: string;

  @Column('text')
  evidenceAssessment: string;

  @Column({ type: 'text', nullable: true })
  sameAdminReason: string | null;

  @Column('integer')
  itemPrice: number;

  @Column({ length: 73 })
  remedyKey: string;

  @Column('jsonb')
  appealIds: string[];

  @Column('timestamptz')
  finalizedAt: Date;

  @Column({ type: 'boolean', nullable: true })
  reviewLate: boolean | null;
}
