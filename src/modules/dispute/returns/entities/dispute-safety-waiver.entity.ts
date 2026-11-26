import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import { DisputeFinalDecision } from '../../entities/dispute-final-decision.entity';

@Entity('dispute_safety_waivers')
@Index(['finalDecisionId'], { unique: true })
export class DisputeSafetyWaiver extends BaseEntity {
  @Column('uuid')
  finalDecisionId: string;

  @ManyToOne(() => DisputeFinalDecision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'finalDecisionId' })
  final: DisputeFinalDecision;

  @Column('uuid')
  orderId: string;

  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;

  @Column({ type: 'varchar', length: 32 })
  basis: 'UNSAFE' | 'NON_TRANSPORTABLE';

  @Column('text')
  reason: string;

  @Column('text')
  instructions: string;

  @Column('uuid')
  verifiedBy: string;

  @Column('jsonb')
  basisEvidenceIds: string[];

  @Column({ type: 'jsonb', nullable: true })
  executionEvidenceIds: string[] | null;

  @Column({ type: 'text', nullable: true })
  executionStatement: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  fulfilledAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  fulfilledBy: string | null;
}
