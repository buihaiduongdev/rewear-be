import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { DisputeFinalDecision } from './dispute-final-decision.entity';

@Entity('dispute_refund_consents')
@Index(['finalDecisionId', 'party'], { unique: true })
export class DisputeRefundConsent extends BaseEntity {
  @Column('uuid')
  finalDecisionId: string;

  @ManyToOne(() => DisputeFinalDecision, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'finalDecisionId' })
  finalDecision: DisputeFinalDecision;

  @Column('uuid')
  actorId: string;

  @Column({ type: 'varchar', length: 16 })
  party: 'BUYER' | 'SELLER';

  @Column({ type: 'varchar', length: 64 })
  planFingerprint: string;
}
