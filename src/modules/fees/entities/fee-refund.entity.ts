import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import type {
  FeeCollectionMethod,
  FeeRefundState,
} from '../schemas/fee.schema';
import { FeeAssessment } from './fee-assessment.entity';
import { FeeCollection } from './fee-collection.entity';

@Entity('fee_refunds')
@Check('CHK_fee_refund_positive', '"amount" > 0')
@Index(['requestId'], { unique: true })
@Index(['collectionId'])
export class FeeRefund extends BaseEntity {
  @Column('uuid')
  collectionId: string;

  @ManyToOne(() => FeeCollection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'collectionId' })
  collection: FeeCollection;

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

  @Column('varchar')
  state: FeeRefundState;

  @Column('uuid')
  requestId: string;

  @Column({ type: 'varchar', nullable: true })
  providerReference: string | null;

  @Column('timestamptz')
  requestedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  nextQueryAt: Date | null;

  @Column('text')
  reason: string;

  @Column('text')
  evidence: string;
}
