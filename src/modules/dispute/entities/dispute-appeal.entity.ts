import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { DisputeAppealEligibility } from '../schemas/dispute-appeal.schema';
import type { DisputeParty } from '../schemas/dispute.schema';
import { DisputeDecision } from './dispute-decision.entity';

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
