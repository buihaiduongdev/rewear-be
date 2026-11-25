import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';
import { User } from '@/modules/user/entities';

import { EXCESS_REVIEW } from '../constants/excess.constant';
import type { ExcessReview, ExcessSource } from '../schemas/excess.schema';

@Entity('wallet_excess_cases')
@Index(['sourceType', 'sourceId'], { unique: true })
@Index(['buyerId', 'mode', 'verifiedAt'])
@Check(
  'CHK_excess_amounts',
  '"sourceAmount" > 0 AND "authorizedAmount" >= 0 AND "authorizedAmount" <= "sourceAmount" AND "version" > 0',
)
export class WalletExcess extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyerId' })
  buyer: User;

  @Column('integer', { default: 1 })
  decisionVersion: number;

  @Column('integer', { nullable: true })
  objectedDecisionVersion: number | null;

  @Column('text', { nullable: true })
  supplementRequest: string | null;

  @Column('uuid')
  buyerId: string;

  @Column('varchar', { length: 16 })
  mode: ReconciliationMode;

  @Column('varchar', { length: 24 })
  sourceType: ExcessSource;

  @Column('uuid')
  sourceId: string;

  @Column('integer')
  sourceAmount: number;

  @Column('integer')
  authorizedAmount: number;

  @Column('integer', { default: 1 })
  version: number;

  @Column('text')
  reason: string;

  @Column('text')
  evidence: string;

  @Column('timestamptz')
  verifiedAt: Date;

  @Column('timestamptz')
  objectionBy: Date;

  @Column('varchar', { length: 16, default: EXCESS_REVIEW.NONE })
  reviewState: ExcessReview;

  @Column('timestamptz', { nullable: true })
  objectedAt: Date | null;

  @Column('text', { nullable: true })
  objectionReason: string | null;

  @Column('text', { nullable: true })
  objectionEvidence: string | null;

  @Column('timestamptz', { nullable: true })
  reviewDueAt: Date | null;

  @Column('timestamptz', { nullable: true })
  reviewOverdueAt: Date | null;

  @Column('timestamptz', { nullable: true })
  responseDueAt: Date | null;
}
