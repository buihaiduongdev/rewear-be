import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

import { DisputeReturn } from './dispute-return.entity';

@Entity('dispute_return_shipping_charges')
@Index(['returnId', 'kind'], { unique: true })
@Index(['mode', 'invoiceReference'], { unique: true })
@Check('CHK_return_shipping_charge_positive', '"amount" > 0')
export class ReturnShippingCharge extends BaseEntity {
  @Column({ type: 'varchar', length: 50, nullable: true })
  waybillCode: string | null;

  @Column('uuid')
  returnId: string;

  @ManyToOne(() => DisputeReturn, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'returnId' })
  returnCase: DisputeReturn;

  @Column('uuid')
  orderId: string;

  @Column('uuid')
  shopId: string;

  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;

  @Column({ type: 'varchar', length: 24 })
  kind: 'STANDARD' | 'REFUSAL_EXTRA';

  @Column('integer')
  amount: number;

  @Column({ length: 120 })
  invoiceReference: string;

  @Column('text')
  evidence: string;

  @Column('text')
  reason: string;

  @Column('uuid')
  actorId: string;
}
