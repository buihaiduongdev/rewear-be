import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';

import type {
  FeeCollectionMethod,
  FeeKind,
  FeeParty,
  FeeRefundState,
  FeeStatus,
} from '../types/fee.type';

@Entity('fee_assessments')
@Check(
  'CHK_fee_amounts',
  '"amount" > 0 AND "payableAmount" >= 0 AND "payableAmount" <= "amount"',
)
@Index(['mode', 'invoiceReference', 'invoiceLine'], { unique: true })
@Index(['orderId', 'mode', 'kind', 'sourceId', 'invoiceLine'], { unique: true })
@Index(['shopId', 'mode', 'status'])
export class FeeAssessment extends BaseEntity {
  @Column('uuid')
  orderId: string;
  @Column('uuid')
  shopId: string;
  @Column('uuid')
  buyerId: string;
  @Column('varchar')
  party: FeeParty;
  @Column('varchar')
  mode: ReconciliationMode;
  @Column('varchar')
  kind: FeeKind;
  @Column('varchar')
  sourceId: string;
  @Column('varchar')
  waybillId: string;
  @Column('varchar')
  invoiceReference: string;
  @Column('varchar')
  invoiceLine: string;
  @Column('integer')
  amount: number;
  @Column({ type: 'integer', nullable: true })
  actualInvoiceAmount: number | null;
  @Column({ type: 'integer', nullable: true })
  originallyQuotedAmount: number | null;
  @Column('integer')
  payableAmount: number;
  @Column('varchar')
  status: FeeStatus;
  @Column('text')
  reason: string;
  @Column('text')
  evidence: string;
  @Column('timestamptz')
  disclosureVerifiedAt: Date;
  @Column({ type: 'timestamptz', nullable: true })
  notifiedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  dueAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  objectionAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  reviewDueAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  reviewOverdueAt: Date | null;
  @Column({ default: false })
  objectionUsed: boolean;
}
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
