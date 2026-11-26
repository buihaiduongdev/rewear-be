import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { FeeAssessment } from './fee-assessment.entity';

@Entity('fee_decisions')
@Index(['feeId'])
export class FeeDecision extends BaseEntity {
  @Column('uuid')
  feeId: string;

  @ManyToOne(() => FeeAssessment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'feeId' })
  fee: FeeAssessment;

  @Column('uuid')
  actorId: string;

  @Column('varchar')
  action: string;

  @Column('integer')
  payableAmount: number;

  @Column('text')
  reason: string;

  @Column('text')
  evidence: string;
}
