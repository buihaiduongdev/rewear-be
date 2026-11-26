import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@/common/entities';

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
