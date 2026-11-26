import { Check, Column, Entity, Index, OneToMany } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { ReconciliationMode } from '../schemas/cod-reconciliation.schema';
import { CodRemittanceAllocation } from './cod-remittance-allocation.entity';

@Entity('cod_remittances')
@Index(['mode', 'reference'], { unique: true })
@Check('CHK_cod_remittance_nonnegative', '"netAmount" >= 0')
export class CodRemittance extends BaseEntity {
  @Column({ type: 'varchar', length: 16 })
  mode: ReconciliationMode;

  @Column({ type: 'varchar', length: 120 })
  reference: string;

  @Column('integer')
  netAmount: number;

  @Column('timestamptz')
  receivedAt: Date;

  @Column('uuid')
  actorId: string;

  @Column('text')
  reason: string;

  @Column('text')
  evidence: string;

  @OneToMany(
    () => CodRemittanceAllocation,
    (allocation) => allocation.remittance,
  )
  allocations: CodRemittanceAllocation[];
}
