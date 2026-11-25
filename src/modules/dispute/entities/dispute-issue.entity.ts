import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { DisputeIssueState, DisputeKind } from '../schemas/dispute.schema';
import { DisputeCase } from './dispute-case.entity';

@Entity('dispute_issues')
@Index(['caseId', 'productId', 'kind'], { unique: true })
@Index(['status', 'supplementBy'])
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

  @Column({ type: 'varchar', length: 24 })
  status: DisputeIssueState;

  @Column('timestamptz')
  supplementBy: Date;

  @Column({ type: 'timestamptz', nullable: true })
  validAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  sellerNotifiedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  sellerRespondBy: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewDueAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  maxReviewDueAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  extendedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  extensionReason: string | null;

  @Column({ default: false })
  calendarMissing: boolean;

  @Column({ default: false })
  reviewOverdue: boolean;

  @Column({ default: false })
  sellerResponseOverdue: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  escalatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  escalationDueAt: Date | null;
}
