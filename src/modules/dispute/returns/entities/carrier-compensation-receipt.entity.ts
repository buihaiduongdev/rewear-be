import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import { DisputeReturnException } from './dispute-return-exception.entity';

@Entity('carrier_compensation_receipts')
@Index(['mode', 'reference'], { unique: true })
@Check('CHK_carrier_receipt_amount', '"amount" > 0')
export class CarrierCompensationReceipt extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  chargeId: string | null;

  @Column('uuid')
  exceptionId: string;

  @ManyToOne(() => DisputeReturnException, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'exceptionId' })
  exception: DisputeReturnException;

  @Column('uuid')
  shopId: string;

  @Column('uuid')
  orderId: string;

  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;

  @Column({ length: 120 })
  reference: string;

  @Column({ type: 'varchar', length: 24 })
  kind: 'CASH' | 'VERIFIED_NETTING';

  @Column('integer')
  amount: number;

  @Column('timestamptz')
  receivedAt: Date;

  @Column('text')
  evidence: string;

  @Column('uuid')
  actorId: string;
}
