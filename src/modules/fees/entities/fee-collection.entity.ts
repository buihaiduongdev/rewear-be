import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import type { FeeCollectionMethod } from '../schemas/fee.schema';
import { FeeAssessment } from './fee-assessment.entity';

@Entity('fee_collections')
@Check('CHK_fee_collection_positive', '"amount" > 0')
@Index(['feeId', 'method', 'sourceId'], { unique: true })
export class FeeCollection extends BaseEntity {
  @Column('uuid')
  feeId: string;

  @ManyToOne(() => FeeAssessment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'feeId' })
  fee: FeeAssessment;

  @Column('varchar')
  mode: ReconciliationMode;

  @Column('varchar')
  method: FeeCollectionMethod;

  @Column('varchar')
  sourceId: string;

  @Column('integer')
  amount: number;
}
