import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import { FeeAssessment } from './fee-assessment.entity';

@Entity('fee_notices')
@Index(['feeId'])
export class FeeNotice extends BaseEntity {
  @Column('uuid')
  feeId: string;

  @ManyToOne(() => FeeAssessment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'feeId' })
  fee: FeeAssessment;

  @Column('uuid')
  recipientId: string;

  @Column('varchar')
  action: string;

  @Column('jsonb')
  snapshot: Record<string, unknown>;
}
