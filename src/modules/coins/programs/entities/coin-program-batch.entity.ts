import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/common/entities';

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
