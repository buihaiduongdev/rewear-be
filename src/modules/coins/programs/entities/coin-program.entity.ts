import { Check, Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import type { ReconciliationMode } from '@/modules/cod-reconciliation/types/cod-reconciliation.type';

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
@Entity('coin_program_batches')
@Index(['programId', 'requestId'], { unique: true })
export class CoinProgramBatch extends BaseEntity {
  @Column('uuid')
  programId: string;
  @Column('uuid')
  requestId: string;
  @Column('text')
  fingerprint: string;
  @Column('jsonb')
  grantIds: string[];
}
@Entity('coin_program_audits')
export class CoinProgramAudit extends BaseEntity {
  @Column('uuid')
  programId: string;
  @Column('uuid')
  actorId: string;
  @Column('varchar')
  action: string;
  @Column('text')
  reason: string;
  @Column('jsonb')
  details: Record<string, unknown>;
}
@Entity('coin_program_mistakes')
@Index(['grantId'], { unique: true })
export class CoinProgramMistake extends BaseEntity {
  @Column('uuid')
  grantId: string;
  @Column('integer')
  target: number;
  @Column('integer')
  platformExpense: number;
  @Column('text')
  evidence: string;
  @Column('uuid')
  actorId: string;
}
