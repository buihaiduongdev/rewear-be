import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type {
  DisputeDecisionOutcome,
  DisputeResponsibility,
} from '../schemas/dispute.schema';
import { DisputeIssue } from './dispute-issue.entity';

@Entity('dispute_decisions')
@Index(['issueId'], { unique: true })
@Check('CHK_dispute_decision_item_price', '"itemPrice" >= 0')
export class DisputeDecision extends BaseEntity {
  @Column('uuid')
  issueId: string;

  @ManyToOne(() => DisputeIssue, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'issueId' })
  issue: DisputeIssue;

  @Column('uuid')
  actorId: string;

  @Column({ type: 'varchar', length: 24 })
  outcome: DisputeDecisionOutcome;

  @Column({ type: 'varchar', length: 16 })
  responsibility: DisputeResponsibility;

  @Column('text')
  reason: string;

  @Column('integer')
  itemPrice: number;

  @Column({ type: 'integer', nullable: true })
  refundAmount: number | null;

  @Column({ length: 73 })
  remedyKey: string;

  @Column('timestamptz')
  decidedAt: Date;

  @Column('timestamptz')
  appealUntil: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finalizedAt: Date | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  finalOutcome: DisputeDecisionOutcome | null;

  @Column({ type: 'integer', nullable: true })
  finalRefundAmount: number | null;

  @Column({ type: 'text', nullable: true })
  finalReason: string | null;

  @Column({ type: 'uuid', nullable: true })
  finalActorId: string | null;
}
