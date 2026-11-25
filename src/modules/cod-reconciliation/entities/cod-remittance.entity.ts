import { Check, Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

import type { ReconciliationMode } from '../schemas/cod-reconciliation.schema';

@Entity('cod_remittances')
@Index(['requestId'], { unique: true })
@Index(['mode', 'reference'], { unique: true })
@Check('CHK_cod_remittance_nonnegative', '"netAmount" >= 0')
export class CodRemittance extends BaseEntity {
  @Column('uuid')
  requestId: string;

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

  @Column({ type: 'varchar', length: 64 })
  requestFingerprint: string;
}
