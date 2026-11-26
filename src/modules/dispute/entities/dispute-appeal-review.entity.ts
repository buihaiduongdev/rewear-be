import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { DisputeDecision } from './dispute-decision.entity';

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
