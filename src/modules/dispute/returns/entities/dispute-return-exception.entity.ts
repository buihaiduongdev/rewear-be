import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import { DisputeFinalDecision } from '../../entities/dispute-final-decision.entity';
import { DisputeReturn } from './dispute-return.entity';

@Entity('dispute_return_exceptions')
@Index(['finalDecisionId', 'direction'], { unique: true })
@Index(['remedyKey', 'direction'], { unique: true })
export class DisputeReturnException extends BaseEntity {
  @Column('uuid')
  finalDecisionId: string;

  @ManyToOne(() => DisputeFinalDecision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'finalDecisionId' })
  final: DisputeFinalDecision;

  @Column('uuid')
  orderId: string;

  @Column('uuid')
  shopId: string;

  @Column({ length: 73 })
  remedyKey: string;

  @Column({ type: 'uuid', nullable: true })
  returnId: string | null;

  @ManyToOne(() => DisputeReturn, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'returnId' })
  returnCase: DisputeReturn | null;

  @Column({ type: 'varchar', length: 16 })
  direction: 'OUTBOUND' | 'RETURN';

  @Column({ type: 'varchar', length: 32 })
  kind: 'CARRIER_LOSS' | 'CARRIER_DAMAGE' | 'SELLER_REFUSAL';

  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;

  @Column({ length: 50 })
  waybillCode: string;

  @Column('text')
  reason: string;

  @Column('text')
  dispositionInstructions: string;

  @Column('jsonb')
  evidenceIds: string[];

  @Column('uuid')
  verifiedBy: string;

  @Column('timestamptz')
  occurredAt: Date;
}
