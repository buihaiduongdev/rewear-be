import { Check, Column, Entity } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/schemas/cod-reconciliation.schema';

@Entity('coin_programs')
@Check('CHK_coin_program_budget', '"budget" >= "issued" AND "issued" >= 0')
export class CoinProgram extends BaseEntity {
  @Column('varchar')
  name: string;
  @Column('text')
  reason: string;
  @Column('text')
  audience: string;
  @Column('uuid')
  createdBy: string;
  @Column('varchar')
  mode: ReconciliationMode;
  @Column('integer')
  budget: number;
  @Column('integer', { default: 0 })
  issued: number;
  @Column('varchar', { default: 'DRAFT' })
  status: 'DRAFT' | 'ACTIVE' | 'STOPPED';
  @Column('timestamptz', { nullable: true })
  expiresAt: Date | null;
}
