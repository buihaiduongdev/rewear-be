import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { DisputeParty } from '../schemas/dispute.schema';
import { DisputeDecision } from './dispute-decision.entity';

@Entity('dispute_appeals')
@Index(['decisionId', 'party'], { unique: true })
export class DisputeAppeal extends BaseEntity {
  @Column('uuid')
  decisionId: string;

  @ManyToOne(() => DisputeDecision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'decisionId' })
  decision: DisputeDecision;

  @Column('uuid')
  actorId: string;

  @Column({ type: 'varchar', length: 16 })
  party: DisputeParty;

  @Column('text')
  reason: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  evidenceIds: string[];

  @Column('timestamptz')
  filedAt: Date;

  @Column('timestamptz')
  reviewDueAt: Date;

  @Column({ default: false })
  reviewOverdue: boolean;
}
