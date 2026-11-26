import { Check, Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import type { FeeKind, FeeParty, FeeStatus } from '../schemas/fee.schema';

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
