import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { DisputeFinalSource } from '../schemas/dispute-appeal.schema';
import type {
  DisputeDecisionOutcome,
  DisputeResponsibility,
} from '../schemas/dispute-decision.schema';
import type { DisputeRefundPlan } from '../schemas/dispute-refund-plan.schema';
import { DisputeDecision } from './dispute-decision.entity';

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

  @Column({ type: 'jsonb', nullable: true })
  refundPlan: DisputeRefundPlan | null;

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
