import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type {
  DisputeDecisionBasis,
  DisputeDecisionOutcome,
  DisputeResponsibility,
} from '../types/dispute-decision.type';
import { DisputeIssue } from './dispute.entity';

@Entity('dispute_decisions')
@Index(['issueId'], { unique: true })
@Index(['requestId'], { unique: true })
@Check('CHK_dispute_decision_item_price', '"itemPrice" >= 0')
export class DisputeDecision extends BaseEntity {
  @Column('uuid')
  issueId: string;

  @ManyToOne(() => DisputeIssue, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'issueId' })
  issue: DisputeIssue;

  @Column('uuid')
  requestId: string;

  @Column('uuid')
  actorId: string;

  @Column({ type: 'varchar', length: 64 })
  requestFingerprint: string;

  @Column({ type: 'varchar', length: 64 })
  reviewToken: string;

  @Column({ type: 'varchar', length: 24 })
  outcome: DisputeDecisionOutcome;

  @Column({ type: 'varchar', length: 16 })
  responsibility: DisputeResponsibility;

  @Column('text')
  reason: string;

  @Column('text')
  evidenceAssessment: string;

  @Column('integer')
  itemPrice: number;

  @Column({ length: 73 })
  remedyKey: string;

  @Column('jsonb')
  basis: DisputeDecisionBasis;

  @Column('timestamptz')
  decidedAt: Date;

  @Column('timestamptz')
  notifiedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  appealUntil: Date | null;

  @Column({ default: false })
  calendarMissing: boolean;

  @Column({ type: 'boolean', nullable: true })
  reviewLate: boolean | null;
}
