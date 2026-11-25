import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { DisputeIssueState, DisputeKind } from '../schemas/dispute.schema';
import { DisputeCase } from './dispute-case.entity';

@Entity('dispute_issues')
@Index(['caseId', 'productId'], { unique: true })
@Index(['status', 'reviewDueAt'])
export class DisputeIssue extends BaseEntity {
  @Column('uuid')
  caseId: string;

  @ManyToOne(() => DisputeCase, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'caseId' })
  case: DisputeCase;

  @Column('uuid')
  productId: string;

  @Column({ type: 'varchar', length: 24 })
  kind: DisputeKind;

  @Column('text')
  description: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  evidenceIds: string[];

  @Column({ type: 'varchar', length: 24 })
  status: DisputeIssueState;

  @Column('timestamptz')
  sellerRespondBy: Date;

  @Column('timestamptz')
  reviewDueAt: Date;

  @Column('timestamptz')
  maxReviewDueAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  extendedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  extensionReason: string | null;

  @Column({ default: false })
  reviewOverdue: boolean;
}
