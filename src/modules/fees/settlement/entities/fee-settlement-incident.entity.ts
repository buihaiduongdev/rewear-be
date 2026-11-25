import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

@Entity('fee_settlement_incidents')
@Index(['kind', 'recordId'], { unique: true })
export class FeeSettlementIncident extends BaseEntity {
  @Column('varchar')
  kind: string;

  @Column('varchar')
  recordId: string;

  @Column({ type: 'integer', default: 1 })
  attempts: number;

  @Column('timestamptz')
  lastAttemptAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
